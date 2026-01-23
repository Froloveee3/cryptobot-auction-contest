import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { EventBusService } from '../common/services/event-bus.service';
import { EventTypes } from '../common/events/event-types';
import { BidPlacedEvent } from '../common/events/bid.events';
import { RoundEndedEvent, RoundExtendedEvent, RoundStartedEvent } from '../common/events/round.events';
import { AuctionRealtimeStateService } from './auction-realtime-state.service';
import { WebsocketGateway } from './websocket.gateway';
import { AuctionPatchPayload } from '../common/types/websocket-events.types';


@Injectable()
export class AuctionRealtimeEventsHandler implements OnModuleInit, OnModuleDestroy {
  private readonly sub = new Subscription();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly lastTop100Json = new Map<string, string>(); 
  private readonly lastRoundJson = new Map<string, string>();
  private readonly pending = new Map<
    string,
    { needsTop: boolean; needsMeta: boolean; needsRound: boolean }
  >();

  constructor(
    private readonly eventBus: EventBusService,
    private readonly realtime: AuctionRealtimeStateService,
    private readonly gateway: WebsocketGateway,
  ) {}

  onModuleInit(): void {
    
    
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    this.sub.add(
      this.eventBus.ofType<BidPlacedEvent>(EventTypes.BidPlaced).subscribe((e) => {
        void this.onBidPlaced(e);
      }),
    );
    this.sub.add(
      this.eventBus.ofType<RoundStartedEvent>(EventTypes.RoundStarted).subscribe((e) => {
        void this.onRoundStarted(e);
      }),
    );
    this.sub.add(
      this.eventBus.ofType<RoundExtendedEvent>(EventTypes.RoundExtended).subscribe((e) => {
        void this.onRoundExtended(e);
      }),
    );
    this.sub.add(
      this.eventBus.ofType<RoundEndedEvent>(EventTypes.RoundEnded).subscribe((e) => {
        void this.onRoundEnded(e);
      }),
    );
  }

  onModuleDestroy(): void {
    this.sub.unsubscribe();
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private scheduleFlush(auctionId: string, delayMs = 150): void {
    const p = this.pending.get(auctionId) ?? { needsTop: false, needsMeta: false, needsRound: false };
    this.pending.set(auctionId, p);
    if (this.timers.has(auctionId)) return;
    const t = setTimeout(() => {
      this.timers.delete(auctionId);
      void this.flush(auctionId);
    }, delayMs);
    this.timers.set(auctionId, t);
  }

  private markPending(auctionId: string, next: { needsTop?: boolean; needsMeta?: boolean; needsRound?: boolean }): void {
    const cur = this.pending.get(auctionId) ?? { needsTop: false, needsMeta: false, needsRound: false };
    const merged = {
      needsTop: Boolean(cur.needsTop || next.needsTop),
      needsMeta: Boolean(cur.needsMeta || next.needsMeta),
      needsRound: Boolean(cur.needsRound || next.needsRound),
    };
    this.pending.set(auctionId, merged);
  }

  private async flush(auctionId: string): Promise<void> {
    const p = this.pending.get(auctionId) ?? { needsTop: true, needsMeta: true, needsRound: true };
    this.pending.delete(auctionId);

    
    await this.realtime.ensureMeta(auctionId);
    await this.realtime.ensureLeaderboardLoaded(auctionId);

    const seq = await this.realtime.nextSeq(auctionId);
    const serverTime = Date.now();

    const patch: AuctionPatchPayload = {
      auctionId,
      seq,
      serverTime,
    };

    if (p.needsMeta) {
      const dm = await this.realtime.computeDynamicMinBid(auctionId);
      patch.remainingSupply = dm.remainingSupply;
      patch.dynamicMinBid = dm.dynamicMinBid;
      patch.cutoffAmount = dm.cutoffAmount;
    }

    if (p.needsTop) {
      const top = await this.realtime.getTop100(auctionId);
      const usernames = await this.realtime.getUsernames(top.map((t) => t.userId));
      const top100 = top.map((t, i) => ({ userId: t.userId, username: usernames[t.userId], amount: t.amount, rank: i + 1 }));
      const topJson = JSON.stringify(top100);
      const last = this.lastTop100Json.get(auctionId);
      patch.top100 = last === topJson ? undefined : (top100 as any);
      this.lastTop100Json.set(auctionId, topJson);
    }

    if (p.needsRound) {
      
      const r = await this.realtime.getCurrentRoundInfo(auctionId);
      const currentRound = { roundId: r.roundId, roundNumber: r.roundNumber, endsAt: r.endsAt };
      const json = JSON.stringify({ roundId: r.roundId, roundNumber: r.roundNumber, endsAtMs: r.endsAtMs });
      const last = this.lastRoundJson.get(auctionId);
      if (last !== json) {
        patch.currentRound = currentRound;
        this.lastRoundJson.set(auctionId, json);
      }
    }

    
    this.gateway.server.to(`auction:${auctionId}`).emit('auction:patch', patch);
  }

  private async onBidPlaced(e: BidPlacedEvent): Promise<void> {
    await this.realtime.applyBidPlaced(e.auctionId, {
      userId: String(e.payload.userId),
      amount: Number((e.payload as any).amount),
      timestamp: (e.payload as any).timestamp,
      displacedUserIds: (e.payload as any).displacedUserIds,
    });
    this.markPending(e.auctionId, { needsTop: true, needsMeta: true });
    this.scheduleFlush(e.auctionId, 120);
  }

  private async onRoundStarted(e: RoundStartedEvent): Promise<void> {
    await this.realtime.applyRoundStarted(e.auctionId, {
      roundId: String(e.payload.roundId),
      roundNumber: Number(e.payload.roundNumber),
      endTime: e.payload.endTime,
    });
    this.markPending(e.auctionId, { needsRound: true });
    this.scheduleFlush(e.auctionId, 50);
  }

  private async onRoundExtended(e: RoundExtendedEvent): Promise<void> {
    await this.realtime.applyRoundExtended(e.payload.auctionId, {
      roundId: String(e.payload.roundId),
      roundNumber: Number(e.payload.roundNumber),
      newEndsAt: e.payload.newEndsAt,
    });
    this.markPending(e.payload.auctionId, { needsRound: true });
    this.scheduleFlush(e.payload.auctionId, 50);
  }

  private async onRoundEnded(e: RoundEndedEvent): Promise<void> {
    await this.realtime.applyRoundEnded(e.auctionId, { winnersUserIds: e.payload.winners.map((w) => String(w.userId)) });
    this.markPending(e.auctionId, { needsTop: true, needsMeta: true, needsRound: true });
    this.scheduleFlush(e.auctionId, 50);
  }
}

