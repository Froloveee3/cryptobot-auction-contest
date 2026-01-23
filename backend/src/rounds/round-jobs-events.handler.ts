import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { EventBusService } from '../common/services/event-bus.service';
import { RoundExtendedEvent, RoundStartedEvent } from '../common/events/round.events';
import { EventTypes } from '../common/events/event-types';
import { RoundJobsService } from './round-jobs.service';

@Injectable()
export class RoundJobsEventsHandler implements OnModuleInit, OnModuleDestroy {
  private readonly sub = new Subscription();
  private readonly logger = new Logger(RoundJobsEventsHandler.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly roundJobs: RoundJobsService,
  ) {}

  onModuleInit(): void {
    this.logger.debug('RoundJobsEventsHandler initialized, subscribing to events');
    
    this.sub.add(
      this.eventBus.ofType<RoundStartedEvent>(EventTypes.RoundStarted).subscribe((e) => {
        this.logger.debug(`Received RoundStartedEvent for round ${e.payload.roundId}, endTime: ${e.payload.endTime}`);
        void this.safeSchedule(e.payload.roundId, e.auctionId, e.payload.endTime);
      }),
    );

    this.sub.add(
      this.eventBus.ofType<RoundExtendedEvent>(EventTypes.RoundExtended).subscribe((e) => {
        this.logger.debug(`Received RoundExtendedEvent for round ${e.payload.roundId}`);
        void this.safeSchedule(e.payload.roundId, e.payload.auctionId, e.payload.newEndsAt);
      }),
    );
  }

  onModuleDestroy(): void {
    this.sub.unsubscribe();
  }

  private async safeSchedule(roundId: string, auctionId: string, endsAt: Date): Promise<void> {
    try {
      await this.roundJobs.scheduleCompleteRound({ roundId, auctionId, endsAt });
    } catch (err) {
      this.logger.error(
        `Failed to schedule complete-round job for round ${roundId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

