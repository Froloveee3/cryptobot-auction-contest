import { Injectable } from '@nestjs/common';
import { IBid } from '../common/types/entities.types';
import {
  PlaceBidDto,
  GetBidsQueryDto,
  PaginatedResponseDto,
} from '../common/types/dto.types';
import { IBidService } from '../common/types/service.types';
import { BalanceService } from '../balance/balance.service';
import { UsersService } from '../users/users.service';
import { CacheService } from '../common/services/cache.service';
import { CACHE_TTL } from '../common/types/cache.types';
import { MongoSession, isTransientTransactionError } from '../common/types/mongodb.types';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  AuctionNotFoundError,
  NoActiveRoundError,
  RoundEndedError,
  BidTooLowError,
  BidIncrementTooLowError,
  NoActiveBidToRaiseError,
  NewBidNotAllowedWhenActiveExistsError,
  WriteConflictError,
  DomainError,
} from '../common/types/domain-errors.types';
import { BidRepository } from '../common/repositories/bid.repository';
import { RoundRepository } from '../common/repositories/round.repository';
import { AuctionRepository } from '../common/repositories/auction.repository';
import { EventBusService } from '../common/services/event-bus.service';
import { RoundExtendedEvent } from '../common/events/round.events';
import { BidPlacedEvent } from '../common/events/bid.events';
import { BidIdempotency } from './schemas/bid-idempotency.schema';
import { getCompleteRoundJobId } from '../common/types/queue.types';
import { Logger } from '@nestjs/common';
import { AuctionBidShedderService } from './auction-bid-shedder.service';

@Injectable()
export class BidsService implements IBidService {
  private readonly logger = new Logger(BidsService.name);

  constructor(
    private bidRepository: BidRepository,
    private roundRepository: RoundRepository,
    private auctionRepository: AuctionRepository,
    private balanceService: BalanceService,
    private usersService: UsersService,
    private cacheService: CacheService,
    private eventBus: EventBusService,
    private readonly shedder: AuctionBidShedderService,
    @InjectModel(BidIdempotency.name) private readonly idemModel: Model<BidIdempotency>,
    @InjectQueue('complete-round') private readonly completeRoundQueue: Queue,
  ) {}

  private async getAuctionCached(auctionId: string) {
    const cacheKey = `auction:${auctionId}` as const;
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached !== null) return cached;
    const auction = await this.auctionRepository.findById(auctionId);
    if (!auction) return null;
    await this.cacheService.set(cacheKey, auction, CACHE_TTL.AUCTION);
    return auction;
  }

  private async getActiveRoundCached(auctionId: string) {
    const cacheKey = `auction:${auctionId}:current-round` as const;
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached !== null) return cached;
    const round = await this.roundRepository.findActiveByAuctionId(auctionId);
    if (!round) return null;
    await this.cacheService.set(cacheKey, round, CACHE_TTL.CURRENT_ROUND);
    return round;
  }

  private async runWithTransactionRetry<T>(
    fn: (session: MongoSession) => Promise<T>,
    { maxAttempts = 5 } = {},
  ): Promise<T> {
    let lastErr: Error | WriteConflictError = new Error('Transaction retry exhausted');
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const session = await this.bidRepository.getModel().db.startSession();
      session.startTransaction();
      try {
        const result = await fn(session);
        await session.commitTransaction();
        return result;
      } catch (e: unknown) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        await session.abortTransaction().catch(() => undefined);
        // Retry transient transaction errors / write conflicts
        if (!isTransientTransactionError(e)) {
          throw e;
        }
        if (attempt === maxAttempts) {
          // Let the client retry (409), instead of returning 500 under contention.
          throw new WriteConflictError();
        }
        // Backoff to reduce contention hot-loops under load (quadratic).
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 25 * attempt * attempt));
      } finally {
        session.endSession();
      }
    }
    throw lastErr;
  }

  async placeBid(
    userId: string,
    auctionId: string,
    data: PlaceBidDto,
    opts?: { idempotencyKey?: string },
  ): Promise<IBid> {
    // Fast load-shedding before touching Mongo. Under extreme load we prefer quick 429 to protect DB.
    await this.shedder.assertNotOverloaded(auctionId);

    const idempotencyKey = opts?.idempotencyKey?.trim() || undefined;
    const idemFilter = idempotencyKey ? { userId, auctionId, key: idempotencyKey } : null;

    if (idemFilter) {
      // Try to create processing record; if exists, replay result.
      try {
        await this.idemModel.create([{ ...idemFilter, status: 'processing', responseBody: null, errorStatus: null, errorBody: null }]);
      } catch (e: any) {
        // Duplicate key => already exists
        const existing = await this.idemModel.findOne(idemFilter).lean().exec();
        if (existing?.status === 'completed' && existing.responseBody) {
          return existing.responseBody as IBid;
        }
        if (existing?.status === 'failed' && existing.errorStatus && existing.errorBody) {
          // Re-throw stored error as a plain Error; our ExceptionFilter will format it.
          const err: any = new Error(existing.errorBody?.message || 'Idempotent request failed');
          err.__httpStatus = existing.errorStatus;
          err.__httpBody = existing.errorBody;
          throw err;
        }
        // processing: short wait for result (handles double-click / client retry)
        const deadline = Date.now() + 2000;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const doc = await this.idemModel.findOne(idemFilter).lean().exec();
          if (doc?.status === 'completed' && doc.responseBody) return doc.responseBody as IBid;
          if (doc?.status === 'failed' && doc.errorStatus && doc.errorBody) {
            const err: any = new Error(doc.errorBody?.message || 'Idempotent request failed');
            err.__httpStatus = doc.errorStatus;
            err.__httpBody = doc.errorBody;
            throw err;
          }
          if (Date.now() > deadline) {
            throw new Error('IDEMPOTENCY_IN_PROGRESS');
          }
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    }

    try {
      // Get auction and active round
      const auction = await this.getAuctionCached(auctionId);
      if (!auction) {
        throw new AuctionNotFoundError(auctionId);
      }

    // NOTE about "between rounds" edge case:
    // There is a tiny window where the previous round's endsAt has passed,
    // but the completion job hasn't created the next round yet.
    // In this window, we prefer a single fast retry (after invalidating cached current-round)
    // so the bid naturally lands in the newly created active round as soon as it appears.
    const ensureActiveRound = async (): Promise<any> => {
      const r = await this.getActiveRoundCached(auctionId);
      if (r) return r;

      // No active round right now.
      // Distinguish "auction ended" vs "round transition in progress".
      const rounds = await this.roundRepository.findByAuctionId(auctionId);
      const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
      if (lastRound) {
        const lastEndsAt = (lastRound.extendedEndTime || lastRound.endTime) as Date;
        const lastEnded = lastRound.status === 'completed' || lastEndsAt.getTime() < Date.now();

        // If last round ended and it's the final round => hard stop (no charge, clear error).
        if (lastEnded && Number(lastRound.roundNumber) >= Number(auction.totalRounds)) {
          throw new RoundEndedError(lastRound._id);
        }
      }
      // Otherwise: next round may be created imminently by background job.
      throw new NoActiveRoundError(auctionId);
    };

    // NOTE: minBid is enforced only for the FIRST bid in a round.
    // For "raise" (user already has an in-play bid), the payload `amount` is treated as DELTA (additive).

    // Определить recipientUserId до транзакции (поиск пользователя по username/telegramId)
    let recipientUserId = userId; // По умолчанию сам пользователь
    if (data.recipient) {
      const kind = data.recipient.kind;
      const value = String(data.recipient.value || '').trim();
      if (!value) {
        throw new Error('Recipient value is required');
      }
      if (kind === 'username') {
        const recipientUser = await this.usersService.findByUsername(value);
        if (!recipientUser) {
          throw new Error(`User with username "${value}" not found`);
        }
        recipientUserId = recipientUser._id;
      } else if (kind === 'telegramId') {
        const recipientUser = await this.usersService.findByTelegramId(value);
        if (!recipientUser) {
          throw new Error(`User with telegramId "${value}" not found`);
        }
        recipientUserId = recipientUser._id;
      } else {
        throw new Error('Unsupported recipient kind');
      }
    }

    // Bid model (auction-level):
    // - Exactly ONE active bid per user per auction.
    // - mode='new': create active bid (forbidden if active exists)
    // - mode='raise': increase existing active bid by delta (forbidden if no active)
    // - Money is locked only for the delta.

    const topN = Math.max(1, auction.winnersPerRound || 1);
    const antiSnipingWindowSec = Number(auction.antiSnipingWindow ?? 0);
    const antiSnipingExtensionSec = Number(auction.antiSnipingExtension ?? 0);

    let round = await ensureActiveRound();
    const mode = data.mode || 'new';
    const activeExists = Boolean(
      await this.bidRepository.getModel().exists({ userId, auctionId, status: 'active' }).exec(),
    );
    if (mode === 'new' && activeExists) {
      throw new NewBidNotAllowedWhenActiveExistsError(auctionId);
    }
    if (mode === 'raise' && !activeExists) {
      throw new NoActiveBidToRaiseError(auctionId);
    }
    // If user is trying to RAISE but the round ends during processing, we MUST NOT retry into next round.
    const isRaiseIntent = mode === 'raise';
    const isExplicitRaise = mode === 'raise';

    // Money-safety: create bid + lock funds atomically and link ledger via referenceId=bidId.
    // Telegram-like anti-sniping: apply the cap update inside the same transaction
    // to reduce races with round completion.
    const runTx = () =>
      this.runWithTransactionRetry<{
        bid: any; // Mongoose document from transaction
        antiSniping?: { oldEndsAt: Date; newEndsAt: Date; topN: number };
        displacedUserIds: string[];
      }>(async (session) => {
      const now = new Date();

      // Critical race hardening (auction-level bids):
      // Touch the Auction document so bid tx conflicts with round-completion tx.
      // This prevents ambiguous outcomes under race conditions without tying bids to rounds.
      const touch = await this.auctionRepository
        .getModel()
        .updateOne({ _id: auctionId, status: 'active' }, { $set: { lastBidAt: now } })
        .session(session)
        .exec();

      if (touch.modifiedCount !== 1) {
        // Auction is not active (completed/cancelled) => do not accept bids/raises.
        throw new RoundEndedError();
      }

      // Dynamic minBid + supply invariants (inside same txn)
      // Supply model: totalSupply = totalRounds * winnersPerRound; remainingSupply decreases as gifts are distributed.
      const auctionDoc = (await this.auctionRepository
        .getModel()
        .findById(auctionId)
        .session(session)
        .lean()
        .exec()) as any;
      if (!auctionDoc) {
        throw new AuctionNotFoundError(auctionId);
      }
      const totalSupply = Number(auctionDoc.totalRounds) * Number(auctionDoc.winnersPerRound);
      const remainingSupply = Math.max(0, totalSupply - Number(auctionDoc.totalGiftsDistributed ?? 0));
      if (remainingSupply <= 0) {
        // Auction is effectively sold out; do not accept new bids.
        throw new RoundEndedError();
      }

      // Current cutoff before applying this bid:
      // - if in-play count < remainingSupply => allow >= auction.minBid
      // - else require >= (cutoffAmount + minIncrement) to avoid ties and prevent minBid decrease
      const preTop = await this.bidRepository
        .getModel()
        .find({
          auctionId,
          status: 'active',
        })
        .select('_id amount timestamp userId')
        .sort({ amount: -1, timestamp: 1 })
        .limit(remainingSupply)
        .session(session)
        .lean()
        .exec();
      const cutoffAmount = preTop.length >= remainingSupply ? Number(preTop[preTop.length - 1]?.amount ?? 0) : null;
      const dynamicMinBid =
        cutoffAmount !== null ? cutoffAmount + Number(auctionDoc.minIncrement ?? 0) : Number(auctionDoc.minBid ?? 0);

      // Active bid is auction-level (one per user per auction)
      const existingInPlay = await this.bidRepository.getModel()
        .find({
          userId,
          auctionId,
          status: 'active',
        })
        .sort({ amount: -1, timestamp: 1 })
        .session(session)
        .exec();

      // If client explicitly requested "raise", there MUST be an in-play bid in this round.
      // Otherwise it is either already settled (won/refunded) or the round has transitioned.
      if (isExplicitRaise && existingInPlay.length === 0) {
        throw new NoActiveBidToRaiseError(auctionId);
      }

      if (process.env.NODE_ENV === 'test') {
        this.logger.debug(
          `[raise-debug] userId=${userId} auctionId=${auctionId} existingInPlay=${existingInPlay.length} amountReq=${data.amount}`,
        );
      }

      // Helper: lock idempotently per target amount (so retries of the same raise do not double-lock).
      const lockRef = (bidId: string, targetAmount: number): string => `${bidId}:lock:${targetAmount}`;

      let bidDoc: any; // Mongoose document
      let didChangeBid = false;

      if (existingInPlay.length === 0) {
        // Apply dynamic minBid for new bids
        if (data.amount < dynamicMinBid) {
          throw new BidTooLowError(data.amount, dynamicMinBid);
        }
        // recipientUserId уже определен выше (до транзакции)
        // Create bid document through model for transaction support
        const newBid = new (this.bidRepository.getModel())({
          userId,
          auctionId,
          amount: data.amount,
          status: 'active',
          timestamp: now,
          giftNumber: null,
          wonRoundNumber: null,
          recipientUserId, // Получатель подарка
        });

        await this.balanceService.lock(userId, data.amount, lockRef(newBid._id.toString(), data.amount), session);
        await newBid.save({ session });
        bidDoc = newBid as any;
        didChangeBid = true;
      } else {
        // Pick the strongest as the primary; any additional in-play bids are legacy duplicates.
        const primary = existingInPlay[0]!;
        const duplicates = existingInPlay.slice(1);

        const currentAmount = Number(primary.amount);
        // Raise semantics: payload amount is DELTA to add to current bid (not absolute target).
        const delta = Number(data.amount);
        const newAmount = currentAmount + delta;

        if (process.env.NODE_ENV === 'test') {
          this.logger.debug(
            `[raise-debug] primary=${String(primary._id)} currentAmount=${currentAmount} delta=${delta} newAmount=${newAmount} minIncrement=${auction.minIncrement}`,
          );
        }

        // Idempotency for client retries: same amount -> no-op (but still return the bid).
        if (delta === 0) {
          bidDoc = primary;
        } else {
          if (delta < auction.minIncrement) {
            // For delta-raise, minIncrement applies to delta.
            throw new BidIncrementTooLowError(delta, auction.minIncrement);
          }
          // Apply dynamic minBid for raises as well (prevents accepting a raise that is below the current cutoff)
          if (newAmount < dynamicMinBid) {
            throw new BidTooLowError(newAmount, dynamicMinBid);
          }
          // Lock only the delta
          await this.balanceService.lock(userId, delta, lockRef(primary._id.toString(), newAmount), session);
          primary.amount = newAmount;
          primary.timestamp = now;
          // При raise можно изменить recipient (recipientUserId уже определен выше)
          if (data.recipient) {
            primary.recipientUserId = recipientUserId;
          }
          await primary.save({ session });
          if (process.env.NODE_ENV === 'test') {
            this.logger.debug(`[raise-debug] afterSave primary=${String(primary._id)} amountNow=${primary.amount}`);
          }
          bidDoc = primary;
          didChangeBid = true;
        }

        // Best-effort cleanup: refund any extra in-play bids of the same user in this round.
        // This gradually converges the system to the "one bid per user" model even if legacy data exists.
        for (const dup of duplicates) {
          const res = await this.bidRepository.getModel()
            .updateOne(
              { _id: dup._id, status: 'active' },
              { $set: { status: 'refunded' } },
            )
            .session(session)
            .exec();
          if (res.modifiedCount === 1) {
            await this.balanceService.refund(userId, dup.amount, dup._id.toString(), session);
          }
        }
      }

      // Enforce supply invariant continuously:
      // keep only top `remainingSupply` in-play bids; refund all displaced immediately.
      const displaced = await this.bidRepository
        .getModel()
        .find({
          auctionId,
          status: 'active',
        })
        .select('_id userId amount')
        .sort({ amount: -1, timestamp: 1 })
        .skip(remainingSupply)
        .session(session)
        .lean()
        .exec();

      const displacedUserIds: string[] = [];
      for (const loser of displaced) {
        // Mark refunded (only if still in-play) and return funds immediately.
        // eslint-disable-next-line no-await-in-loop
        const upd = await this.bidRepository
          .getModel()
          .updateOne({ _id: loser._id, status: 'active' }, { $set: { status: 'refunded' } })
          .session(session)
          .exec();
        if ((upd as any).modifiedCount === 1) {
          displacedUserIds.push(String(loser.userId));
          // eslint-disable-next-line no-await-in-loop
          await this.balanceService.refund(String(loser.userId), Number(loser.amount), String(loser._id), session);
        }
      }

      // --- Anti-sniping (single extension per round) inside transaction ---
      // trigger: bid accepted in last `antiSnipingWindowSec` seconds AND inTopN (computed after bid is written)
      // action: extend endsAt by `antiSnipingExtensionSec` ONCE per round (extensionCount < 1)
      let antiSniping: { oldEndsAt: Date; newEndsAt: Date; topN: number } | undefined;
      if (
        didChangeBid &&
        Number.isFinite(antiSnipingWindowSec) &&
        antiSnipingWindowSec > 0 &&
        Number.isFinite(antiSnipingExtensionSec) &&
        antiSnipingExtensionSec > 0
      ) {
        const roundNow = await this.roundRepository.findById(round._id, session);
        if (roundNow?.status === 'active' && roundNow.startTime) {
          const oldEndsAt = (roundNow.extendedEndTime ?? roundNow.endTime)!;
          const timeLeftSec = (oldEndsAt.getTime() - now.getTime()) / 1000;
          const isLate = timeLeftSec > 0 && timeLeftSec <= antiSnipingWindowSec;
          const canExtend = Number((roundNow as any).extensionCount ?? 0) < 1;
          if (isLate && canExtend) {
            // Performance: select only _id field needed for topN check
            // Use getModel() for transaction-aware query with select
            const topBidsNow = await this.bidRepository.getModel()
              .find({ auctionId, status: 'active' })
              .select('_id')
              .sort({ amount: -1, timestamp: 1 })
              .limit(topN)
              .session(session)
              .lean()
              .exec();

            const inTopN = topBidsNow.some((b) => String(b._id) === bidDoc._id.toString());
            if (inTopN) {
              const newEndsAt = new Date(oldEndsAt.getTime() + antiSnipingExtensionSec * 1000);
              // Atomic "extend once": only if still active AND extensionCount < 1 AND endsAt hasn't moved.
              const upd = await this.roundRepository
                .getModel()
                .updateOne(
                  {
                    _id: round._id,
                    status: 'active',
                    extensionCount: { $lt: 1 },
                    $expr: { $eq: [{ $ifNull: ['$extendedEndTime', '$endTime'] }, oldEndsAt] },
                  } as any,
                  { $set: { extendedEndTime: newEndsAt, extensionCount: 1 } } as any,
                )
                .session(session)
                .exec();
              if (upd.modifiedCount === 1) {
                antiSniping = { oldEndsAt, newEndsAt, topN };
              }
            }
          }
        }
      }

      return { bid: bidDoc, antiSniping, displacedUserIds };
    });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Retry on RoundEndedError to allow "auto transfer" into the next round if it appears.
    // This is safe: all money ops are inside the txn, and the round "touch" happens before any lock.
    let tx: {
      bid: any;
      antiSniping?: { oldEndsAt: Date; newEndsAt: Date; topN: number };
      displacedUserIds: string[];
    };
    try {
      tx = await runTx();
    } catch (e: unknown) {
      if (e instanceof RoundEndedError) {
        // If this request was a raise attempt for the current round, do NOT retry into next round.
        // This prevents accidental bids in next round when the user intended to raise.
        if (isRaiseIntent || isExplicitRaise) {
          throw e;
        }
        // Drop cached current round (may be stale) and try to pick up the new active round.
        await this.cacheService.invalidateActiveRound(auctionId);
        // If the previous round has already passed endsAt but the completion job is delayed,
        // reschedule completion to run ASAP to create the next round quickly (UX: "between rounds" bid).
        const prevRoundId = String((round as any)?._id ?? '');
        if (prevRoundId) {
          const jobId = getCompleteRoundJobId(prevRoundId);
          await this.completeRoundQueue.remove(jobId).catch(() => undefined);
          await this.completeRoundQueue
            .add('complete-round', { roundId: prevRoundId, auctionId }, { jobId, delay: 0 })
            .catch(() => undefined);
        }
        // Poll a short window for the next active round to appear.
        // (Background completion + outbox dispatch is usually sub-100ms, but we give it some slack.)
        // Under load / busy event loop, round transition can take longer than 500ms.
        const maxAttempts = 80; // 80 * 50ms = 4s
        for (let i = 0; i < maxAttempts; i += 1) {
          try {
            // eslint-disable-next-line no-await-in-loop
            round = await ensureActiveRound();
            break;
          } catch (err: unknown) {
            // If auction ended, propagate immediately.
            if (err instanceof RoundEndedError) throw err;
            // eslint-disable-next-line no-await-in-loop
            await sleep(50);
          }
        }
        tx = await runTx();
      } else {
        throw e;
      }
    }

    const bid = tx.bid;

    // After commit: reschedule completion job and emit WS payload if anti-sniping extended.
    if (tx.antiSniping) {
      this.eventBus.publish(
        new RoundExtendedEvent({
          auctionId,
          roundId: round._id,
          roundNumber: round.roundNumber,
          oldEndsAt: tx.antiSniping.oldEndsAt,
          newEndsAt: tx.antiSniping.newEndsAt,
          reason: 'late_bid_in_topN',
          topN: tx.antiSniping.topN,
        }),
      );
    }

    // Convert Mongoose document to plain object
    const bidPayload: IBid = {
      ...bid.toObject ? bid.toObject() : bid,
      _id: bid._id.toString(),
    } as IBid;
    // Extend WS payload with displaced users (for realtime leaderboard correctness).
    if (tx.displacedUserIds && tx.displacedUserIds.length > 0) {
      (bidPayload as any).displacedUserIds = tx.displacedUserIds;
    }
    if (process.env.NODE_ENV === 'test') {
      this.logger.debug(
        `[raise-debug] returnPayload bidId=${String(bidPayload._id)} amount=${String((bidPayload as any).amount)}`,
      );
    }
    this.eventBus.publish(new BidPlacedEvent(auctionId, bidPayload));

    // Record business metrics
    // (moved to MetricsEventsHandler via BidPlacedEvent)

    if (idemFilter) {
      await this.idemModel.updateOne(idemFilter, { $set: { status: 'completed', responseBody: bidPayload, errorStatus: null, errorBody: null } }).exec();
    }

      if (idemFilter) {
        await this.idemModel
          .updateOne(idemFilter, { $set: { status: 'completed', responseBody: bidPayload, errorStatus: null, errorBody: null } })
          .exec();
      }

      return bidPayload;
    } catch (e: unknown) {
      if (idemFilter) {
        if (e instanceof DomainError) {
          await this.idemModel
            .updateOne(idemFilter, { $set: { status: 'failed', errorStatus: e.statusCode, errorBody: { code: e.code, message: e.message, details: e.details } } })
            .exec();
        } else if (e instanceof Error && e.message === 'IDEMPOTENCY_IN_PROGRESS') {
          // leave as processing
        } else if (e instanceof Error) {
          await this.idemModel
            .updateOne(idemFilter, { $set: { status: 'failed', errorStatus: 500, errorBody: { code: 'INTERNAL_ERROR', message: e.message } } })
            .exec();
        }
      }
      throw e;
    }
  }

  async findByAuction(
    auctionId: string,
    query: GetBidsQueryDto,
  ): Promise<PaginatedResponseDto<IBid>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: { auctionId: string; userId?: string } = { auctionId };
    if (query.userId) filter.userId = query.userId;

    // TODO: Add pagination support to BaseRepository
    const allData = await this.bidRepository.findByAuctionId(auctionId);
    const filtered = allData.filter((item) => {
      if (query.userId && item.userId !== query.userId) return false;
      return true;
    });
    const sorted = filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const data = sorted.slice(skip, skip + limit);
    const total = sorted.length;

    return {
      data: data.map((item) => ({
        ...item,
        id: item._id,
        _id: item._id,
      })) as IBid[],
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
