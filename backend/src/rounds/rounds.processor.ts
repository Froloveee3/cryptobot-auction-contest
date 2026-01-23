import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { CompleteRoundJobData } from '../common/types/queue.types';
import { MetricsService } from '../metrics/metrics.service';
import { isReplicaSetError, isTransientTransactionError } from '../common/types/mongodb.types';
import { RoundCompletionOrchestrator } from './services/round-completion-orchestrator.service';
import { RoundRepository } from '../common/repositories/round.repository';
import { EventBusService } from '../common/services/event-bus.service';
import { RoundEndedEvent, RoundStartedEvent } from '../common/events/round.events';
import { AuctionEndedEvent, AuctionUpdatedEvent } from '../common/events/auction.events';
import { RoundJobsService } from './round-jobs.service';
import { runWithRequestId } from '../common/utils/request-context';

@Processor('complete-round')
export class RoundsProcessor extends WorkerHost {
  private readonly logger = new Logger(RoundsProcessor.name);

  constructor(
    private metrics: MetricsService,
    private roundCompletionOrchestrator: RoundCompletionOrchestrator,
    private roundRepository: RoundRepository,
    private eventBus: EventBusService,
    private roundJobs: RoundJobsService,
    @InjectQueue('outbox-dispatch') private readonly outboxDispatchQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<CompleteRoundJobData>): Promise<void> {
    const requestId = job.id ? `job:${String(job.id)}` : `job:complete-round:${Date.now()}`;
    return runWithRequestId(requestId, async () => {
      const { roundId, auctionId } = job.data;
      const startedAt = Date.now();
      this.logger.log(`Processing round completion: ${roundId} for auction ${auctionId}`);

      // Anti-sniping correctness guard:
      // A round can be extended after the job was initially scheduled (Telegram-like `duration + increase`).
      // If this job runs before the effective endsAt (endTime/extendedEndTime), we MUST reschedule it and exit.
      const roundSnapshot = await this.roundRepository.findById(roundId);
      if (!roundSnapshot) {
        this.logger.warn(`Round ${roundId} not found (job will noop)`);
        return;
      }
      if (roundSnapshot.status === 'completed') {
        this.logger.warn(`Round ${roundId} already completed (job will noop)`);
        return;
      }
      if (roundSnapshot.status === 'active') {
        const endsAt = (roundSnapshot.extendedEndTime ?? roundSnapshot.endTime) as Date;
        const nowMs = Date.now();
        // Small tolerance to avoid tight reschedule loops on boundary.
        if (nowMs + 50 < endsAt.getTime()) {
          // Centralize queue interaction (thin processor)
          await this.roundJobs.scheduleCompleteRound({ roundId, auctionId, endsAt });
          const delay = Math.max(0, endsAt.getTime() - nowMs);
          this.logger.log(`Round ${roundId} completion ran early; rescheduled in ${delay}ms`);
          return;
        }
      }

      // Try to use transaction with retry (write conflicts are expected under concurrent bidding),
      // fallback to non-transactional if replica set is not available.
      const maxAttempts = 5;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const session = await this.roundRepository.getModel().db.startSession();
          session.startTransaction();
          try {
            const result = await this.roundCompletionOrchestrator.completeRound(roundId, auctionId, session);

            // Persist events in the SAME transaction (outbox). Delivery happens after commit.
            if (result) {
              await this.eventBus.publishAsync(new RoundEndedEvent(auctionId, result.roundEnded), { session, emit: false });
              if (result.auctionUpdated) {
                await this.eventBus.publishAsync(new AuctionEndedEvent(auctionId, 'completed'), { session, emit: false });
                  const auction = result.auctionUpdated.auction;
                  await this.eventBus.publishAsync(
                    new AuctionUpdatedEvent(auctionId, {
                      ...auction,
                      _id: auction._id,
                      status: result.auctionUpdated.status,
                    }),
                    { session, emit: false },
                  );
              }
              if (result.nextRound) {
                await this.eventBus.publishAsync(
                  new RoundStartedEvent(auctionId, {
                    auctionId,
                    roundId: result.nextRound.roundId,
                    roundNumber: result.nextRound.roundNumber,
                    startTime: result.nextRound.startTime,
                    endTime: result.nextRound.endTime,
                  }),
                  { session, emit: false },
                );
              }
            }

            await session.commitTransaction();
            this.logger.log(`Transaction committed for round ${roundId}`);

            // Kick outbox dispatcher AFTER commit so events are visible
            this.logger.debug('Kicking outbox dispatcher...');
            await this.outboxDispatchQueue
              .add('dispatch', {}, { jobId: `dispatch-outbox-${Date.now()}`, removeOnComplete: true, removeOnFail: true })
              .catch((e) => this.logger.error(`Failed to kick outbox dispatcher: ${e}`));
            
            this.metrics.bullmqJobsTotal.labels('complete-round', job.name, 'completed').inc();
            this.metrics.bullmqJobDurationMs
              .labels('complete-round', job.name, 'completed')
              .observe(Date.now() - startedAt);
            return;
          } catch (error: unknown) {
            await session.abortTransaction().catch(() => undefined);

            // Retry transient transaction errors / write conflicts.
            if (isTransientTransactionError(error) && attempt < maxAttempts) {
              // Backoff to reduce contention.
              // eslint-disable-next-line no-await-in-loop
              await new Promise((r) => setTimeout(r, 50 * attempt * attempt));
              continue;
            }

            this.metrics.bullmqJobsTotal.labels('complete-round', job.name, 'failed').inc();
            this.metrics.bullmqJobDurationMs
              .labels('complete-round', job.name, 'failed')
              .observe(Date.now() - startedAt);
            throw error;
          } finally {
            session.endSession();
          }
        } catch (transactionError: unknown) {
          // Fallback for standalone MongoDB (no replica set)
          if (isReplicaSetError(transactionError)) {
            this.logger.warn('Replica set not available, using fallback without transactions');
            try {
              // Use orchestrator without session (it will handle non-transactional mode)
              const result = await this.roundCompletionOrchestrator.completeRoundWithoutTransaction(roundId, auctionId);
              
            this.metrics.bullmqJobsTotal.labels('complete-round', job.name, 'completed').inc();
            this.metrics.bullmqJobDurationMs
              .labels('complete-round', job.name, 'completed')
              .observe(Date.now() - startedAt);

              // Publish domain events via outbox (no replica set => no session, but still durable delivery)
              // Use publishAsync to WAIT for persistence before kicking dispatcher
              if (result) {
                await this.eventBus.publishAsync(new RoundEndedEvent(auctionId, result.roundEnded), { emit: false });
                if (result.auctionUpdated) {
                  await this.eventBus.publishAsync(new AuctionEndedEvent(auctionId, 'completed'), { emit: false });
                  const auction = result.auctionUpdated.auction;
                  await this.eventBus.publishAsync(
                    new AuctionUpdatedEvent(auctionId, {
                      ...auction,
                      _id: auction._id,
                      status: result.auctionUpdated.status,
                    }),
                    { emit: false },
                  );
                }
                
                // Schedule next round completion job if needed
                if (result.nextRound) {
                  await this.eventBus.publishAsync(
                    new RoundStartedEvent(auctionId, {
                      auctionId,
                      roundId: result.nextRound.roundId,
                      roundNumber: result.nextRound.roundNumber,
                      startTime: result.nextRound.startTime,
                      endTime: result.nextRound.endTime,
                    }),
                    { emit: false },
                  );

                  const delay = result.nextRound.duration * 1000;
                  this.logger.log(
                    `Next round ${result.nextRound.roundNumber} (${result.nextRound.roundId}) will be scheduled to complete in ${delay}ms`,
                  );
                }

                // Kick outbox dispatcher AFTER events are persisted (fallback path)
                await this.outboxDispatchQueue
                  .add('dispatch', {}, { jobId: `dispatch-outbox-fb-${Date.now()}`, removeOnComplete: true, removeOnFail: true })
                  .catch(() => undefined);
              }
              return;
            } catch (fallbackError: unknown) {
              this.logger.error(`Fallback processing failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
              this.metrics.bullmqJobsTotal.labels('complete-round', job.name, 'failed').inc();
              this.metrics.bullmqJobDurationMs
                .labels('complete-round', job.name, 'failed')
                .observe(Date.now() - startedAt);
              throw fallbackError;
            }
          }
          this.metrics.bullmqJobsTotal.labels('complete-round', job.name, 'failed').inc();
          this.metrics.bullmqJobDurationMs
            .labels('complete-round', job.name, 'failed')
            .observe(Date.now() - startedAt);
          throw transactionError;
        }
      }
    });
  }
}
