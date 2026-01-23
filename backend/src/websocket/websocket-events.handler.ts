import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { EventBusService } from '../common/services/event-bus.service';
import { WebsocketGateway } from './websocket.gateway';
import { RoundEndedEvent, RoundExtendedEvent, RoundStartedEvent } from '../common/events/round.events';
import { BidPlacedEvent } from '../common/events/bid.events';
import { AuctionCreatedEvent, AuctionUpdatedEvent } from '../common/events/auction.events';
import { EventTypes } from '../common/events/event-types';
import { AuctionRepository } from '../common/repositories/auction.repository';
import { AuctionUpdatedPayload } from '../common/types/websocket-events.types';
import { AuctionLobbyCacheService } from '../auctions/auction-lobby-cache.service';

@Injectable()
export class WebsocketEventsHandler implements OnModuleInit, OnModuleDestroy {
  private readonly sub = new Subscription();
  private lobbyRefreshTimer?: NodeJS.Timeout;

  constructor(
    private readonly eventBus: EventBusService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly auctions: AuctionRepository,
    private readonly lobbyCache: AuctionLobbyCacheService,
  ) {}

  onModuleInit(): void {
    this.sub.add(
      this.eventBus.ofType<AuctionCreatedEvent>(EventTypes.AuctionCreated).subscribe((e) => {
        this.websocketGateway.emitAuctionCreated(e.payload);
        this.scheduleLobbyRefresh();
      }),
    );

    this.sub.add(
      this.eventBus.ofType<RoundStartedEvent>(EventTypes.RoundStarted).subscribe((e) => {
        this.websocketGateway.emitRoundStarted(e.auctionId, e.payload);
        void this.emitLobbyAuctionUpdate(e.auctionId, {
          currentRound: e.payload.roundNumber,
          currentRoundEndsAt: e.payload.endTime,
        });
        this.scheduleLobbyRefresh();
      }),
    );

    this.sub.add(
      this.eventBus.ofType<RoundEndedEvent>(EventTypes.RoundEnded).subscribe((e) => {
        this.websocketGateway.emitRoundEnded(e.auctionId, e.payload);
        this.scheduleLobbyRefresh();
      }),
    );

    this.sub.add(
      this.eventBus.ofType<RoundExtendedEvent>(EventTypes.RoundExtended).subscribe((e) => {
        this.websocketGateway.emitRoundExtended(e.payload.auctionId, e.payload);
        void this.emitLobbyAuctionUpdate(e.payload.auctionId, {
          currentRound: e.payload.roundNumber,
          currentRoundEndsAt: e.payload.newEndsAt,
        });
        this.scheduleLobbyRefresh();
      }),
    );

    this.sub.add(
      this.eventBus.ofType<BidPlacedEvent>(EventTypes.BidPlaced).subscribe((e) => {
        this.websocketGateway.emitBidPlaced(e.auctionId, e.payload);
      }),
    );

    this.sub.add(
      this.eventBus.ofType<AuctionUpdatedEvent>(EventTypes.AuctionUpdated).subscribe((e) => {
        this.websocketGateway.emitAuctionUpdated(e.auctionId, e.payload);
        if (e.payload.status === 'completed' || e.payload.status === 'cancelled') {
          void this.emitLobbyAuctionUpdate(e.auctionId, { endedAt: e.payload.endedAt ?? null });
        }
        this.scheduleLobbyRefresh();
      }),
    );
  }

  onModuleDestroy(): void {
    this.sub.unsubscribe();
    if (this.lobbyRefreshTimer) {
      clearTimeout(this.lobbyRefreshTimer);
    }
  }

  private async emitLobbyAuctionUpdate(
    auctionId: string,
    overrides: Partial<AuctionUpdatedPayload>,
  ): Promise<void> {
    const auction = await this.auctions.findById(auctionId);
    if (!auction) return;
    const totalSupply = Number(auction.totalRounds) * Number(auction.winnersPerRound);
    const remainingSupply = Math.max(0, totalSupply - Number(auction.totalGiftsDistributed ?? 0));
    const payload: AuctionUpdatedPayload = {
      _id: String(auction._id),
      status: auction.status,
      currentRound: auction.currentRound,
      totalGiftsDistributed: auction.totalGiftsDistributed,
      remainingSupply,
      ...overrides,
    };
    this.websocketGateway.emitLobbyAuctionUpdated(payload);
  }

  private scheduleLobbyRefresh(): void {
    if (this.lobbyRefreshTimer) return;
    this.lobbyRefreshTimer = setTimeout(() => {
      this.lobbyRefreshTimer = undefined;
      void this.refreshLobbySnapshots();
    }, 150);
  }

  private async refreshLobbySnapshots(): Promise<void> {
    const snapshots = await this.lobbyCache.rebuildAll();
    for (const { tab, snapshot } of snapshots) {
      this.websocketGateway.server.to('auctions:lobby').emit('lobby:snapshot', {
        ...snapshot,
        tab,
        serverTime: Date.now(),
      });
    }
  }
}

