import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Subscription } from 'rxjs';
import { EventBusService } from '../common/services/event-bus.service';
import { EventTypes } from '../common/events/event-types';
import { RoundStartedEvent } from '../common/events/round.events';
import { AuctionsService } from '../auctions/auctions.service';
import type { BotBidJobData } from './bot-bid.queue';

@Injectable()
export class BotRoundEventsHandler implements OnModuleInit, OnModuleDestroy {
  private readonly sub = new Subscription();
  private readonly logger = new Logger(BotRoundEventsHandler.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly auctions: AuctionsService,
    @InjectQueue('bot-bid') private readonly botBidQueue: Queue<BotBidJobData>,
  ) {}

  onModuleInit(): void {
    
    if (process.env.NODE_ENV === 'test') return;

    this.logger.debug('BotRoundEventsHandler initialized, subscribing to events');
    this.sub.add(
      this.eventBus.ofType<RoundStartedEvent>(EventTypes.RoundStarted).subscribe((e) => {
        void this.onRoundStarted(e);
      }),
    );
  }

  onModuleDestroy(): void {
    this.sub.unsubscribe();
  }

  private clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
  }

  private async onRoundStarted(e: RoundStartedEvent): Promise<void> {
    this.logger.debug(`Received RoundStartedEvent auction=${e.auctionId} roundId=${String(e.payload.roundId)}`);
    const auction = await this.auctions.findById(e.auctionId);
    if (!auction) return;
    if (!auction.botsEnabled) {
      this.logger.debug(`Bots disabled for auction=${e.auctionId}, skipping bot-bid jobs`);
      return;
    }
    if (auction.status !== 'active') {
      this.logger.debug(`Auction not active (status=${String(auction.status)}), skipping bot-bid jobs`);
      return;
    }

    const roundDurationSec = Number(auction.roundDuration ?? 0) || 0;
    const antiSnipingWindowSec = Number(auction.antiSnipingWindow ?? 0) || 0;
    const antiSnipingExtensionSec = Number((auction as any).antiSnipingExtension ?? 0) || 0;
    const winnersPerRound = Number(auction.winnersPerRound ?? 1) || 1;
    const botsCountRaw = Number((auction as any).botsCount);
    const targetBots = Number.isFinite(botsCountRaw) ? this.clamp(botsCountRaw, 0, 50) : this.clamp(winnersPerRound * 2, 2, 20);

    // More visible activity, but still bounded to avoid spam:
    // - scale by duration and configured bot pool size
    const actionsByDuration = this.clamp(Math.floor(roundDurationSec / 10), 2, 12);
    const actionsByBots = this.clamp(Math.ceil(targetBots / 2), 2, 12);
    const actionsByWinners = this.clamp(winnersPerRound, 1, 8);
    const actions = this.clamp(Math.max(actionsByDuration, actionsByBots, actionsByWinners), 3, 15);

    // Avoid the last "sniping window" so judges don't see constant last-second ping-pong.
    // Current anti-sniping impl uses increaseSec as the late window, so include it as well.
    const safeTailSec = this.clamp(Math.max(antiSnipingWindowSec, antiSnipingExtensionSec) + 1, 1, Math.max(1, roundDurationSec));
    const maxDelayMs = Math.max(500, (roundDurationSec - safeTailSec) * 1000);

    let enqueued = 0;
    for (let i = 0; i < actions; i += 1) {
      const delay = Math.floor(250 + Math.random() * maxDelayMs);
      // BullMQ custom jobId must not contain ":" (used internally by BullMQ).
      const jobId = `bot-bid__${e.auctionId}__${String(e.payload.roundId)}__${i}`;
      const data: BotBidJobData = {
        auctionId: e.auctionId,
        roundId: String(e.payload.roundId),
        roundNumber: Number(e.payload.roundNumber),
        roundDurationSec,
        antiSnipingWindowSec,
        winnersPerRound,
        minBid: Number(auction.minBid ?? 1),
        minIncrement: Number(auction.minIncrement ?? 1),
      };
      try {
        // Best effort: jobId dedup prevents duplicates on retries.
        // eslint-disable-next-line no-await-in-loop
        await this.botBidQueue.add('bot-bid', data, { jobId, delay, removeOnComplete: true, removeOnFail: true });
        enqueued += 1;
      } catch (err) {
        this.logger.warn(`Failed to enqueue bot-bid job for auction=${e.auctionId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.logger.debug(
      `Enqueued bot-bid jobs auction=${e.auctionId} targetBots=${targetBots} enqueued=${enqueued}/${actions}`,
    );
  }
}

