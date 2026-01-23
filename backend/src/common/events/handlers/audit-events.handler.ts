import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { EventBusService, DomainEvent } from '../../services/event-bus.service';
import { DomainEventsAuditService } from '../../../audit/domain-events-audit.service';
import { BidPlacedEvent } from '../bid.events';
import { RoundEndedEvent } from '../round.events';
import { AuctionCreatedEvent, AuctionEndedEvent, AuctionStartedEvent } from '../auction.events';
import { EventTypes } from '../event-types';
import { randomUUID } from 'crypto';

@Injectable()
export class AuditEventsHandler implements OnModuleInit, OnModuleDestroy {
  private readonly sub = new Subscription();
  private readonly logger = new Logger(AuditEventsHandler.name);
  private isShuttingDown = false;

  constructor(
    private readonly eventBus: EventBusService,
    private readonly audit: DomainEventsAuditService,
  ) {}

  onModuleInit(): void {
    this.sub.add(
      this.eventBus.ofType<BidPlacedEvent>(EventTypes.BidPlaced).subscribe((e) => {
        void this.safeAppend(e, {
          auctionId: e.auctionId,
          roundId: null,
          bidId: e.payload._id,
          payload: { ...e.payload },
        });
      }),
    );

    this.sub.add(
      this.eventBus.ofType<RoundEndedEvent>(EventTypes.RoundEnded).subscribe((e) => {
        void this.safeAppend(e, {
          auctionId: e.auctionId,
          roundId: e.payload.roundId,
          bidId: null,
          payload: { ...e.payload },
        });
      }),
    );

    this.sub.add(
      this.eventBus.ofType<AuctionEndedEvent>(EventTypes.AuctionEnded).subscribe((e) => {
        void this.safeAppend(e, {
          auctionId: e.auctionId,
          roundId: null,
          bidId: null,
          payload: { reason: e.reason },
        });
      }),
    );

    this.sub.add(
      this.eventBus.ofType<AuctionStartedEvent>(EventTypes.AuctionStarted).subscribe((e) => {
        void this.safeAppend(e, {
          auctionId: e.auctionId,
          roundId: null,
          bidId: null,
          payload: { title: e.title },
        });
      }),
    );

    this.sub.add(
      this.eventBus.ofType<AuctionCreatedEvent>(EventTypes.AuctionCreated).subscribe((e) => {
        void this.safeAppend(e, {
          auctionId: e.auctionId,
          roundId: null,
          bidId: null,
          payload: { ...e.payload },
        });
      }),
    );
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true;
    this.sub.unsubscribe();
  }

  private async safeAppend(
    e: DomainEvent,
    data: { auctionId: string | null; roundId: string | null; bidId: string | null; payload: Record<string, unknown> },
  ): Promise<void> {
    try {
      if (this.isShuttingDown) return;
      await this.audit.append({
        eventId: e.eventId ?? randomUUID(),
        eventType: e.eventType,
        eventVersion: e.eventVersion ?? 1,
        timestamp: e.timestamp,
        requestId: e.requestId ?? null,
        auctionId: data.auctionId,
        roundId: data.roundId,
        bidId: data.bidId,
        payload: data.payload,
      });
    } catch (err) {
      
      const code = (err as any)?.code;
      if (code === 11000) return;

      
      const msg = err instanceof Error ? err.message : String(err);
      if (this.isShuttingDown) return;
      if (msg.toLowerCase().includes('client was closed') || msg.toLowerCase().includes('topology is closed')) return;
      if (process.env.NODE_ENV === 'test') return;
      
      this.logger.error(`Failed to append audit event ${e.eventType}: ${msg}`);
    }
  }
}

