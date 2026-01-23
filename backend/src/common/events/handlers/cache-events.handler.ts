import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { CacheService } from '../../services/cache.service';
import { EventBusService } from '../../services/event-bus.service';
import { BidPlacedEvent } from '../bid.events';
import { RoundEndedEvent, RoundExtendedEvent, RoundStartedEvent } from '../round.events';
import { AuctionUpdatedEvent } from '../auction.events';
import { CacheKey } from '../../types/cache.types';
import { EventTypes } from '../event-types';

@Injectable()
export class CacheEventsHandler implements OnModuleInit, OnModuleDestroy {
  private readonly sub = new Subscription();

  constructor(
    private readonly eventBus: EventBusService,
    private readonly cacheService: CacheService,
  ) {}

  onModuleInit(): void {
    this.sub.add(
      this.eventBus.ofType<BidPlacedEvent>(EventTypes.BidPlaced).subscribe((e) => {
        void this.onBidPlaced(e);
      }),
    );

    this.sub.add(
      this.eventBus.ofType<RoundEndedEvent>(EventTypes.RoundEnded).subscribe((e) => {
        void this.onRoundEnded(e);
      }),
    );

    this.sub.add(
      this.eventBus.ofType<RoundStartedEvent>(EventTypes.RoundStarted).subscribe((e) => {
        void this.onRoundStarted(e);
      }),
    );

    this.sub.add(
      this.eventBus.ofType<AuctionUpdatedEvent>(EventTypes.AuctionUpdated).subscribe((e) => {
        void this.onAuctionUpdated(e);
      }),
    );

    this.sub.add(
      this.eventBus.ofType<RoundExtendedEvent>(EventTypes.RoundExtended).subscribe((e) => {
        void this.onRoundExtended(e);
      }),
    );
  }

  onModuleDestroy(): void {
    this.sub.unsubscribe();
  }

  private async onBidPlaced(e: BidPlacedEvent): Promise<void> {
    
    await this.cacheService.invalidateAuction(e.auctionId);
    await this.cacheService.invalidateActiveRound(e.auctionId);
    await this.cacheService.delete(`auction:${e.auctionId}:supply` as CacheKey);
  }

  private async onRoundEnded(e: RoundEndedEvent): Promise<void> {
    // Round completion changes both round pointer + auction state (especially on completion).
    await this.cacheService.invalidateActiveRound(e.auctionId);
    await this.cacheService.invalidateAuction(e.auctionId);
  }

  private async onRoundStarted(e: RoundStartedEvent): Promise<void> {
    await this.cacheService.invalidateActiveRound(e.auctionId);
  }

  private async onAuctionUpdated(e: AuctionUpdatedEvent): Promise<void> {
    await this.cacheService.invalidateAuction(e.auctionId);
  }

  private async onRoundExtended(e: RoundExtendedEvent): Promise<void> {
    // EndsAt changed -> current-round cache becomes stale.
    await this.cacheService.invalidateActiveRound(e.payload.auctionId);
  }
}

