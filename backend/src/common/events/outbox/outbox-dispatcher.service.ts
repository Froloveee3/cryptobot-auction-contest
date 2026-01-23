import { Injectable, Logger } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { EventBusService } from '../../services/event-bus.service';

@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private running = false;
  private readonly maxAttempts = 10;

  constructor(
    private readonly outbox: OutboxService,
    private readonly eventBus: EventBusService,
  ) {}

  async drainBatch(max = 100): Promise<number> {
    if (this.running) {
      this.logger.debug('drainBatch skipped (already running)');
      return 0;
    }
    this.running = true;
    this.logger.debug(`drainBatch started, max=${max}`);
    try {
      let processed = 0;
      for (let i = 0; i < max; i += 1) {
        const now = new Date();
        // eslint-disable-next-line no-await-in-loop
        const item = await this.outbox.claimNext(now);
        if (!item) {
          this.logger.debug(`No more pending events after ${processed} items`);
          break;
        }

        this.logger.debug(`Processing outbox event: ${item.eventType} (${item.eventId})`);
        try {
          // IMPORTANT: emit only (do not re-enqueue).
          this.eventBus.emit(item.event as any);
          // eslint-disable-next-line no-await-in-loop
          await this.outbox.markPublished(item.eventId);
          processed += 1;
          this.logger.debug(`Emitted and marked published: ${item.eventType}`);
        } catch (err) {
          const attempts = item.attempts ?? 1;

          // DLQ: stop retrying after maxAttempts
          if (attempts >= this.maxAttempts) {
            // eslint-disable-next-line no-await-in-loop
            await this.outbox.markDead(item.eventId, {
              error: err instanceof Error ? err.message : String(err),
            });
            this.logger.error(
              `Outbox event moved to dead-letter after ${attempts} attempts: ${item.eventType} (${item.eventId})`,
            );
            continue;
          }

          const backoffMs = Math.min(60_000, 250 * 2 ** Math.min(10, attempts));
          const nextAttemptAt = new Date(Date.now() + backoffMs);
          // eslint-disable-next-line no-await-in-loop
          await this.outbox.markFailed(item.eventId, {
            error: err instanceof Error ? err.message : String(err),
            nextAttemptAt,
          });
          this.logger.error(`Outbox dispatch failed for ${item.eventType} (${item.eventId}): ${String(err)}`);
        }
      }

      return processed;
    } finally {
      this.running = false;
    }
  }
}

