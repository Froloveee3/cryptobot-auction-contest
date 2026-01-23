import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { Bot } from './schemas/bot.schema';
import { AuctionsService } from '../auctions/auctions.service';
import { UsersService } from '../users/users.service';
import { BidsService } from '../bids/bids.service';
import type { BotBidJobData } from './bot-bid.queue';

@Processor('bot-bid')
export class BotBidProcessor extends WorkerHost {
  private readonly logger = new Logger(BotBidProcessor.name);

  constructor(
    @InjectModel(Bot.name) private readonly botModel: Model<Bot>,
    private readonly auctions: AuctionsService,
    private readonly users: UsersService,
    private readonly bids: BidsService,
  ) {
    super();
  }

  private clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
  }

  private async ensureBotsForAuction(params: {
    auctionId: string;
    targetCount: number;
    minBid: number;
  }): Promise<Array<{ botId: string; userId: string }>> {
    const existing = await this.botModel
      .find({ auctionId: params.auctionId, isActive: true })
      .select({ _id: 1, userId: 1 })
      .lean()
      .exec();

    const out = existing.map((b) => ({ botId: String(b._id), userId: String((b as any).userId) }));
    const need = Math.max(0, params.targetCount - out.length);
    if (need === 0) return out;

    const bigBalance = 1_000_000_000;
    for (let i = 0; i < need; i += 1) {
      const username = `_bot${params.auctionId.slice(-4)}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
      // eslint-disable-next-line no-await-in-loop
      const user = await this.users.create({ username, initialBalance: bigBalance });
      const name = username;
      const bot = await this.botModel.create({
        name,
        type: 'simple',
        userId: String(user._id),
        auctionId: params.auctionId,
        isActive: true,
        // These fields are not used by the new round-driven scheduler, but keep sane defaults.
        minAmount: Math.max(1, params.minBid),
        maxAmount: Math.max(1, params.minBid * 50),
        minInterval: 10_000,
        maxInterval: 60_000,
        totalBids: 0,
        lastBidAt: null,
      });
      out.push({ botId: String(bot._id), userId: String((bot as any).userId) });
    }
    return out;
  }

  async process(job: Job<BotBidJobData>): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;

    const data = job.data;
    const auctionId = String(data.auctionId || '');
    if (!auctionId) return;

    const auction = await this.auctions.findById(auctionId);
    if (!auction || auction.status !== 'active' || !auction.botsEnabled) return;

    const winnersPerRound = Number(data.winnersPerRound ?? auction.winnersPerRound ?? 1) || 1;
    const minBid = Number(data.minBid ?? auction.minBid ?? 1) || 1;
    const minIncrement = Number(data.minIncrement ?? auction.minIncrement ?? 1) || 1;

    // Per-auction bot pool size (optional). If not set, use a sane default.
    const cfgBots = Number((auction as any).botsCount);
    const targetBots = Number.isFinite(cfgBots) ? this.clamp(cfgBots, 0, 50) : this.clamp(winnersPerRound * 2, 2, 20);
    const bots = await this.ensureBotsForAuction({ auctionId, targetCount: targetBots, minBid });
    if (bots.length === 0) return;

    // Pick a bot randomly; if it fails to bid, we simply stop (no retries here).
    const pick = bots[Math.floor(Math.random() * bots.length)]!;
    const userId = pick.userId;

    // Choose action:
    // - Prefer "new" if bot has no active bid
    // - Otherwise randomly "raise" or "new" (new might be rejected; we fallback)
    // Prefer raises so observers can see bots climb and displace others.
    const tryRaise = Math.random() < 0.85;

    const attemptNew = async (amount: number): Promise<void> => {
      await this.bids.placeBid(
        userId,
        auctionId,
        { amount, mode: 'new', recipient: null },
        { idempotencyKey: `bot:${String(job.id)}:new:${amount}` },
      );
    };

    const attemptRaise = async (delta: number): Promise<void> => {
      await this.bids.placeBid(
        userId,
        auctionId,
        { amount: delta, mode: 'raise', recipient: null },
        { idempotencyKey: `bot:${String(job.id)}:raise:${delta}` },
      );
    };

    // Keep bids near the cutoff (to simulate competition but not "always win").
    // We don't know dynamicMinBid here; just try minBid first and retry once if too low.
    const baseNewAmount = minBid;
    // Sometimes raise more than one increment to make movement visible.
    const raiseSteps = Math.random() < 0.7 ? 1 : Math.random() < 0.9 ? 2 : 3;
    const baseRaiseDelta = minIncrement * raiseSteps;

    try {
      if (tryRaise) {
        try {
          await attemptRaise(baseRaiseDelta);
          return;
        } catch (err: any) {
          // Fallback to new if bot has no active bid.
          if (err?.code === 'NO_ACTIVE_BID_TO_RAISE') {
            // fall through
          } else {
            // raise can fail due to round ended, etc. Just stop.
            return;
          }
        }
      }

      try {
        await attemptNew(baseNewAmount);
      } catch (err: any) {
        if (err?.code === 'BID_TOO_LOW' && typeof err?.details?.minBid === 'number') {
          const required = Number(err.details.minBid);
          const bump = Math.random() < 0.6 ? 0 : minIncrement;
          await attemptNew(required + bump);
          return;
        }
        if (err?.code === 'NEW_BID_NOT_ALLOWED_WHEN_ACTIVE_EXISTS') {
          // Bot already has an active bid; try a small raise.
          await attemptRaise(baseRaiseDelta);
          return;
        }
        // Ignore other failures (auction ended, etc.)
        return;
      }
    } catch (e) {
      this.logger.debug(`bot-bid failed auction=${auctionId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

