import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { AuctionRepository } from '../common/repositories/auction.repository';
import { RoundRepository } from '../common/repositories/round.repository';
import { BidRepository } from '../common/repositories/bid.repository';
import { UsersService } from '../users/users.service';
import { AuctionSnapshotPayload } from '../common/types/websocket-events.types';

type TopEntry = { userId: string; amount: number };

@Injectable()
export class AuctionRealtimeStateService {
  
  
  
  private static readonly SCORE_MULT = 1_000_000_000; 

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly auctions: AuctionRepository,
    private readonly rounds: RoundRepository,
    private readonly bids: BidRepository,
    private readonly usersService: UsersService,
  ) {}

  private k(auctionId: string) {
    return {
      seq: `auction:${auctionId}:rt:seq`,
      meta: `auction:${auctionId}:rt:meta`,
      round: `auction:${auctionId}:rt:round`,
      lb: `auction:${auctionId}:rt:lb`,
      loaded: `auction:${auctionId}:rt:lb:loaded`,
      loading: `auction:${auctionId}:rt:lb:loading`,
      username: (userId: string) => `user:${userId}:username`,
    } as const;
  }

  private score(amount: number, ts: Date | number): number {
    const tsMs = typeof ts === 'number' ? ts : ts.getTime();
    const mult = AuctionRealtimeStateService.SCORE_MULT;
    const base = Math.floor(Number(amount)) * mult;
    const tie = mult - (tsMs % mult);
    const s = base + tie;
    // Guard against unsafe precision; fallback to amount-only.
    if (!Number.isFinite(s) || s > Number.MAX_SAFE_INTEGER) return Number(amount);
    return s;
  }

  private decodeScoreToAmount(score: number): number {
    const mult = AuctionRealtimeStateService.SCORE_MULT;
    return Number.isFinite(score) && score > mult ? Math.floor(score / mult) : score;
  }

  async nextSeq(auctionId: string): Promise<number> {
    const v = await this.redis.incr(this.k(auctionId).seq);
    return Number(v);
  }

  async ensureMeta(auctionId: string): Promise<{
    minBid: number;
    minIncrement: number;
    remainingSupply: number;
  }> {
    const keys = this.k(auctionId);
    const existing = await this.redis.hgetall(keys.meta);
    if (existing && Object.keys(existing).length > 0) {
      return {
        minBid: Number(existing.minBid ?? 0),
        minIncrement: Number(existing.minIncrement ?? 0),
        remainingSupply: Number(existing.remainingSupply ?? 0),
      };
    }

    const auction = await this.auctions.findById(auctionId);
    if (!auction) {
      // Keep defaults; caller will likely handle missing auction elsewhere.
      return { minBid: 0, minIncrement: 0, remainingSupply: 0 };
    }
    const totalSupply = Number(auction.totalRounds) * Number(auction.winnersPerRound);
    const remainingSupply = Math.max(0, totalSupply - Number(auction.totalGiftsDistributed ?? 0));
    const minBid = Number(auction.minBid ?? 0);
    const minIncrement = Number(auction.minIncrement ?? 0);

    await this.redis.hset(keys.meta, {
      minBid: String(minBid),
      minIncrement: String(minIncrement),
      totalRounds: String(auction.totalRounds),
      winnersPerRound: String(auction.winnersPerRound),
      totalGiftsDistributed: String(auction.totalGiftsDistributed ?? 0),
      remainingSupply: String(remainingSupply),
    });

    // Keep round info warm too
    const round = await this.rounds.findActiveByAuctionId(auctionId);
    if (round) {
      const endsAt = (round.extendedEndTime ?? round.endTime) as Date;
      await this.redis.hset(keys.round, {
        roundId: String(round._id),
        roundNumber: String(round.roundNumber),
        endsAtMs: String(endsAt.getTime()),
      });
    } else {
      await this.redis.hset(keys.round, { roundId: '', roundNumber: '', endsAtMs: '' });
    }

    return { minBid, minIncrement, remainingSupply };
  }

  async ensureLeaderboardLoaded(auctionId: string): Promise<void> {
    const keys = this.k(auctionId);
    const loaded = await this.redis.get(keys.loaded);
    if (loaded === '1') return;

    // Stampede protection: only one instance should load from Mongo at a time.
    const lockOk = await this.redis.set(keys.loading, '1', 'PX', 10_000, 'NX');
    const hadLock = Boolean(lockOk);
    if (!lockOk) {
      // Wait briefly for the other loader to finish.
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        const done = await this.redis.get(keys.loaded);
        if (done === '1') return;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 50));
      }
      // If still not loaded, proceed without lock (best effort).
    }

    // Load all active bids into Redis ZSET (auction-level, bounded by remainingSupply invariant).
    const active = await this.bids
      .getModel()
      .find({ auctionId, status: 'active' })
      .select({ userId: 1, amount: 1, timestamp: 1 })
      .sort({ amount: -1, timestamp: 1 })
      .lean()
      .exec();

    if (active.length > 0) {
      const pipe = this.redis.pipeline();
      for (const b of active) {
        pipe.zadd(keys.lb, this.score(Number(b.amount), (b as any).timestamp ?? Date.now()), String(b.userId));
      }
      await pipe.exec();
    }

    await this.redis.set(keys.loaded, '1');
    if (hadLock) {
      await this.redis.del(keys.loading).catch(() => undefined);
    }
  }

  async applyBidPlaced(auctionId: string, payload: { userId: string; amount: number; timestamp: Date | number; displacedUserIds?: string[] }): Promise<void> {
    const keys = this.k(auctionId);
    const pipe = this.redis.pipeline();
    pipe.zadd(keys.lb, this.score(Number(payload.amount), payload.timestamp), String(payload.userId));
    if (payload.displacedUserIds && payload.displacedUserIds.length > 0) {
      pipe.zrem(keys.lb, ...payload.displacedUserIds.map(String));
    }
    await pipe.exec();
  }

  async applyRoundStarted(auctionId: string, payload: { roundId: string; roundNumber: number; endTime: Date }): Promise<void> {
    const keys = this.k(auctionId);
    await this.redis.hset(keys.round, {
      roundId: String(payload.roundId),
      roundNumber: String(payload.roundNumber),
      endsAtMs: String(payload.endTime.getTime()),
    });
  }

  async applyRoundExtended(auctionId: string, payload: { roundId: string; roundNumber: number; newEndsAt: Date }): Promise<void> {
    const keys = this.k(auctionId);
    await this.redis.hset(keys.round, {
      roundId: String(payload.roundId),
      roundNumber: String(payload.roundNumber),
      endsAtMs: String(payload.newEndsAt.getTime()),
    });
  }

  async applyRoundEnded(auctionId: string, payload: { winnersUserIds: string[] }): Promise<void> {
    const keys = this.k(auctionId);
    // Make sure meta exists (first event after cold start).
    await this.ensureMeta(auctionId);
    // Winners are no longer active
    if (payload.winnersUserIds.length > 0) {
      await this.redis.zrem(keys.lb, ...payload.winnersUserIds.map(String));
    }

    // Update supply meta without DB (burn winnersPerRound per round).
    // This matches domain rule: totalGiftsDistributed increases by winnersPerRound even if fewer bids placed.
    const meta = await this.redis.hgetall(keys.meta);
    const totalRounds = Number(meta.totalRounds ?? 0);
    const winnersPerRound = Number(meta.winnersPerRound ?? 0);
    const totalSupply = totalRounds * winnersPerRound;
    const prevDistributed = Number(meta.totalGiftsDistributed ?? 0);
    const nextDistributed = prevDistributed + winnersPerRound;
    const remainingSupply = Math.max(0, totalSupply - nextDistributed);
    await this.redis.hset(keys.meta, {
      totalGiftsDistributed: String(nextDistributed),
      remainingSupply: String(remainingSupply),
    });

    // Clear current round info immediately.
    // There is typically a gap between rounds where auction has no active round.
    // Without clearing, clients may keep showing stale roundNumber/endsAt until next snapshot/resync.
    await this.redis.hset(keys.round, { roundId: '', roundNumber: '', endsAtMs: '' });
  }

  async getTop100(auctionId: string): Promise<TopEntry[]> {
    const keys = this.k(auctionId);
    const raw = await this.redis.zrevrange(keys.lb, 0, 99, 'WITHSCORES');
    const out: TopEntry[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const userId = raw[i];
      const score = raw[i + 1];
      if (!userId || !score) continue;
      const s = Number(score);
      const amount = this.decodeScoreToAmount(s);
      out.push({ userId: String(userId), amount });
    }
    return out;
  }

  private async withUsernames(userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {};
    const realKeys = userIds.map((id) => `user:${id}:username`);
    const cached = await this.redis.mget(...realKeys);

    const map: Record<string, string> = {};
    const missing: string[] = [];
    for (let i = 0; i < userIds.length; i += 1) {
      const id = userIds[i]!;
      const v = cached[i];
      if (typeof v === 'string' && v.length > 0) {
        map[id] = v;
      } else {
        missing.push(id);
      }
    }

    if (missing.length > 0) {
      const users = await Promise.all(missing.map((id) => this.usersService.findById(id)));
      const pipe = this.redis.pipeline();
      for (let i = 0; i < missing.length; i += 1) {
        const id = missing[i]!;
        const u = users[i];
        if (u && (u as any).username) {
          const username = String((u as any).username);
          map[id] = username;
          // Cache for 24h
          pipe.setex(`user:${id}:username`, 24 * 60 * 60, username);
        }
      }
      await pipe.exec();
    }

    return map;
  }

  // Public helper for other handlers (keeps caching logic centralized here).
  async getUsernames(userIds: string[]): Promise<Record<string, string>> {
    return this.withUsernames(userIds);
  }

  async computeDynamicMinBid(auctionId: string): Promise<{ dynamicMinBid: number; cutoffAmount: number | null; remainingSupply: number; minBid: number; minIncrement: number }> {
    const { minBid, minIncrement, remainingSupply } = await this.ensureMeta(auctionId);
    const keys = this.k(auctionId);
    const count = Number(await this.redis.zcard(keys.lb));
    if (remainingSupply <= 0) {
      return { dynamicMinBid: Number.POSITIVE_INFINITY, cutoffAmount: null, remainingSupply, minBid, minIncrement };
    }
    if (count < remainingSupply) {
      return { dynamicMinBid: minBid, cutoffAmount: null, remainingSupply, minBid, minIncrement };
    }
    const idx = Math.max(0, remainingSupply - 1);
    const raw = await this.redis.zrevrange(keys.lb, idx, idx, 'WITHSCORES');
    const score = raw.length >= 2 ? Number(raw[1]) : null;
    const mult = AuctionRealtimeStateService.SCORE_MULT;
    const cutoffAmount = score !== null ? (score > mult ? Math.floor(score / mult) : score) : null;
    const dynamicMinBid = cutoffAmount !== null ? cutoffAmount + minIncrement : minBid;
    return { dynamicMinBid, cutoffAmount, remainingSupply, minBid, minIncrement };
  }

  async buildSnapshot(auctionId: string, userId?: string): Promise<AuctionSnapshotPayload> {
    await this.ensureMeta(auctionId);
    await this.ensureLeaderboardLoaded(auctionId);

    const keys = this.k(auctionId);
    const seq = Number(await this.redis.get(keys.seq)) || 0;
    const serverTime = Date.now();

    const roundHash = await this.redis.hgetall(keys.round);
    const roundId = roundHash.roundId ? String(roundHash.roundId) : null;
    const roundNumber = roundHash.roundNumber ? Number(roundHash.roundNumber) : null;
    const endsAtMs = roundHash.endsAtMs ? Number(roundHash.endsAtMs) : null;

    const top = await this.getTop100(auctionId);
    const usernames = await this.withUsernames(top.map((t) => t.userId));

    // ranks for top100 are simply 1..N
    const top100 = top.map((t, i) => ({
      userId: t.userId,
      username: usernames[t.userId],
      amount: t.amount,
      rank: i + 1,
    }));

    const dm = await this.computeDynamicMinBid(auctionId);

    let me: AuctionSnapshotPayload['me'] | undefined;
    if (userId) {
      const rank0 = await this.redis.zrevrank(keys.lb, userId);
      const score = await this.redis.zscore(keys.lb, userId);
      const decodedAmount =
        score !== null ? this.decodeScoreToAmount(Number(score)) : null;
      me = {
        userId,
        rank: typeof rank0 === 'number' ? rank0 + 1 : null,
        amount: decodedAmount,
      };
    }

    return {
      auctionId,
      seq,
      serverTime,
      currentRound: {
        roundId,
        roundNumber,
        endsAt: endsAtMs ? new Date(endsAtMs) : null,
      },
      remainingSupply: dm.remainingSupply,
      minBid: dm.minBid,
      minIncrement: dm.minIncrement,
      dynamicMinBid: dm.dynamicMinBid,
      cutoffAmount: dm.cutoffAmount,
      top100,
      me,
    };
  }

  async getCurrentRoundInfo(auctionId: string): Promise<{
    roundId: string | null;
    roundNumber: number | null;
    endsAt: Date | null;
    endsAtMs: number | null;
  }> {
    const keys = this.k(auctionId);
    const roundHash = await this.redis.hgetall(keys.round);
    const roundId = roundHash.roundId ? String(roundHash.roundId) : null;
    const roundNumber = roundHash.roundNumber ? Number(roundHash.roundNumber) : null;
    const endsAtMs = roundHash.endsAtMs ? Number(roundHash.endsAtMs) : null;
    return {
      roundId,
      roundNumber,
      endsAt: endsAtMs ? new Date(endsAtMs) : null,
      endsAtMs: endsAtMs ?? null,
    };
  }
}

