import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { EventBusService } from '../../services/event-bus.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { BidPlacedEvent } from '../bid.events';
import { RoundEndedEvent, RoundStartedEvent } from '../round.events';
import { AuctionEndedEvent, AuctionStartedEvent } from '../auction.events';
import { EventTypes } from '../event-types';

@Injectable()
export class MetricsEventsHandler implements OnModuleInit, OnModuleDestroy {
  private readonly sub = new Subscription();

  constructor(
    private readonly eventBus: EventBusService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.sub.add(
      this.eventBus.ofType<BidPlacedEvent>(EventTypes.BidPlaced).subscribe((e) => {
        
        this.metrics.bidsTotal.labels(e.auctionId, 'auction', 'placed').inc();
      }),
    );

    this.sub.add(
      this.eventBus.ofType<RoundStartedEvent>(EventTypes.RoundStarted).subscribe((e) => {
        this.metrics.roundsTotal.labels(e.auctionId, 'started').inc();
      }),
    );

    this.sub.add(
      this.eventBus.ofType<RoundEndedEvent>(EventTypes.RoundEnded).subscribe((e) => {
        this.metrics.roundsTotal.labels(e.auctionId, 'completed').inc();
      }),
    );

    this.sub.add(
      this.eventBus.ofType<AuctionStartedEvent>(EventTypes.AuctionStarted).subscribe((_e) => {
        this.metrics.auctionsTotal.labels('active').inc();
      }),
    );

    this.sub.add(
      this.eventBus.ofType<AuctionEndedEvent>(EventTypes.AuctionEnded).subscribe((e) => {
        if (e.reason === 'completed') {
          this.metrics.auctionsTotal.labels('completed').inc();
        } else {
          this.metrics.auctionsTotal.labels('cancelled').inc();
        }
      }),
    );
  }

  onModuleDestroy(): void {
    this.sub.unsubscribe();
  }
}

