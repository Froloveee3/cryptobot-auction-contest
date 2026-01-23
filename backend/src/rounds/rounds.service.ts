import { Injectable, NotFoundException } from '@nestjs/common';
import { IRound } from '../common/types/entities.types';
import { LeaderboardEntryDto } from '../common/types/dto.types';
import { IRoundService } from '../common/types/service.types';
import { CacheService } from '../common/services/cache.service';
import { CACHE_TTL } from '../common/types/cache.types';
import { RoundRepository } from '../common/repositories/round.repository';
import { EventBusService } from '../common/services/event-bus.service';
import { RoundExtendedEvent, RoundStartedEvent } from '../common/events/round.events';

@Injectable()
export class RoundsService implements IRoundService {
  constructor(
    private roundRepository: RoundRepository,
    private cacheService: CacheService,
    private eventBus: EventBusService,
  ) {}

  async create(auctionId: string, roundNumber: number): Promise<IRound> {
    const now = new Date();
    const saved = await this.roundRepository.create({
      auctionId,
      roundNumber,
      status: 'pending',
      startTime: now, 
      endTime: now,
      winnersCount: 1,
      participants: [],
      winners: [],
      extensionCount: 0,
    } as Partial<IRound>);
    return saved;
  }

  async start(roundId: string, roundDuration?: number, roundParams?: { duration: number; antiSnipingWindow: number; antiSnipingExtension: number; maxRoundExtensions: number; winnersPerRound: number }): Promise<IRound> {
    const round = await this.roundRepository.findById(roundId);
    if (!round) {
      throw new NotFoundException(`Round with ID ${roundId} not found`);
    }

    const startTime = new Date();
    const duration = roundDuration ?? (roundParams?.duration ?? 5 * 60);
    const endTime = new Date(startTime.getTime() + duration * 1000);

    const updateData: Partial<IRound> = {
      status: 'active',
      startTime,
      endTime,
    };

    // Сохранить параметры раунда, если указаны
    if (roundParams) {
      updateData.roundDuration = roundParams.duration;
      updateData.antiSnipingWindow = roundParams.antiSnipingWindow;
      updateData.antiSnipingExtension = roundParams.antiSnipingExtension;
      updateData.maxRoundExtensions = roundParams.maxRoundExtensions;
    }

    const updated = await this.roundRepository.updateById(roundId, updateData);
    if (!updated) {
      throw new NotFoundException(`Round with ID ${roundId} not found`);
    }

    // Domain event: round started (WebSocket + observers)
    this.eventBus.publish(
      new RoundStartedEvent(
        updated.auctionId,
        {
          auctionId: updated.auctionId,
          roundId: updated._id,
          roundNumber: updated.roundNumber,
          startTime: updated.startTime!,
          endTime: updated.endTime!,
        },
      ),
    );

    return updated;
  }

  async complete(roundId: string): Promise<IRound> {
    // Implementation will be in processor
    const round = await this.roundRepository.findById(roundId);
    if (!round) {
      throw new NotFoundException(`Round with ID ${roundId} not found`);
    }
    return round;
  }

  async extend(roundId: string, extensionSeconds: number): Promise<IRound> {
    const round = await this.roundRepository.findById(roundId);
    if (!round) {
      throw new NotFoundException(`Round with ID ${roundId} not found`);
    }

    const oldEndTime = (round.extendedEndTime ?? round.endTime)!;
    const newEndTime = new Date(oldEndTime.getTime() + extensionSeconds * 1000);

    const updated = await this.roundRepository.updateById(roundId, {
      extendedEndTime: newEndTime,
      extensionCount: (round.extensionCount ?? 0) + 1,
    } as Partial<IRound>);

    if (!updated) {
      throw new NotFoundException(`Round with ID ${roundId} not found`);
    }

    // Domain event: round extended
    if (updated.status === 'active') {
      this.eventBus.publish(
        new RoundExtendedEvent({
          auctionId: updated.auctionId,
          roundId: updated._id,
          roundNumber: updated.roundNumber,
          oldEndsAt: oldEndTime,
          newEndsAt: newEndTime,
          reason: 'manual_extend',
          topN: 0,
        }),
      );
    }

    return updated;
  }

  async findById(id: string): Promise<IRound | null> {
    return this.roundRepository.findById(id);
  }

  async findByAuctionAndNumber(auctionId: string, roundNumber: number): Promise<IRound | null> {
    return this.roundRepository.findByAuctionAndNumber(auctionId, roundNumber);
  }

  async findByAuction(auctionId: string): Promise<IRound[]> {
    return this.roundRepository.findByAuctionId(auctionId);
  }

  async getActiveRound(auctionId: string): Promise<IRound | null> {
    const cacheKey = `auction:${auctionId}:current-round` as const;

    // Try cache first
    const cached = await this.cacheService.get<IRound>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from DB
    // Use repository method that uses compound index { auctionId: 1, status: 1 }
    const round = await this.roundRepository.findActiveByAuctionId(auctionId);
    if (!round) {
      return null;
    }

    // Cache the result (short TTL because round can be extended)
    await this.cacheService.set(cacheKey, round, CACHE_TTL.CURRENT_ROUND);

    return round;
  }

  async getLeaderboard(_roundId: string, _limit: number): Promise<LeaderboardEntryDto[]> {
    // Implementation with aggregation
    return [];
  }

  async checkAndExtendRound(roundId: string, auction?: { antiSnipingWindow: number; antiSnipingExtension: number; maxRoundExtensions: number }): Promise<boolean> {
    // Legacy method (kept for compatibility with existing callers).
    // Telegram-like spec is implemented in `tryAntiSnipingExtendTelegramLike`.
    // We intentionally keep this as a no-op wrapper so older code doesn't accidentally use
    // multi-extension semantics.
    if (!auction) return false;
    const res = await this.tryAntiSnipingExtendTelegramLike({
      roundId,
      topN: 0, // cannot determine here
      durationSec: 0, // cannot determine here
      increaseSec: auction.antiSnipingExtension,
      inTopN: false,
    });
    return res.extended;
  }

  /**
   * Telegram-like anti-sniping:
   * - lateWindowSeconds = increaseSec
   * - cap: maxEndTime = startTime + durationSec + increaseSec
   * - trigger: late && inTopN (after bid is written)
   * - action: endsAt := maxEndTime (idempotent)
   */
  async tryAntiSnipingExtendTelegramLike(params: {
    roundId: string;
    durationSec: number;
    increaseSec: number;
    topN: number;
    inTopN: boolean;
    atMs?: number; // server-side bid acceptance time (ms)
  }): Promise<{ extended: boolean; oldEndsAt?: Date; newEndsAt?: Date; topN?: number }> {
    const { roundId, durationSec, increaseSec, topN, inTopN, atMs } = params;

    if (!inTopN) return { extended: false };
    if (!Number.isFinite(increaseSec) || increaseSec <= 0) return { extended: false };
    if (!Number.isFinite(durationSec) || durationSec <= 0) return { extended: false };

    const round = await this.roundRepository.findById(roundId);
    if (!round) return { extended: false };
    if (round.status !== 'active') return { extended: false };
    if (!round.startTime) return { extended: false };

    const oldEndsAt: Date = (round.extendedEndTime ?? round.endTime)!;
    // IMPORTANT: "late" must be evaluated at the time the bid was accepted by the server,
    // not at a later wall-clock moment after the transaction commits (can drift past endsAt).
    const effectiveAtMs = typeof atMs === 'number' ? atMs : Date.now();
    const timeLeftSec = (oldEndsAt.getTime() - effectiveAtMs) / 1000;
    const isLate = timeLeftSec > 0 && timeLeftSec <= increaseSec; // lateWindowSeconds = increaseSec
    if (!isLate) return { extended: false };

    const maxEndTime = new Date(round.startTime.getTime() + (durationSec + increaseSec) * 1000);
    if (oldEndsAt.getTime() >= maxEndTime.getTime()) {
      return { extended: false };
    }

    // Idempotent cap update: extend only if current endsAt < maxEndTime.
    // Note: This uses MongoDB expressions that require direct model access.
    // TODO: Consider extracting this to a specialized method in RoundRepository.
    const upd = await this.roundRepository.getModel()
      .updateOne(
        {
          _id: roundId,
          status: 'active',
          $expr: {
            $lt: [{ $ifNull: ['$extendedEndTime', '$endTime'] }, maxEndTime],
          },
        } as any,
        {
          $set: {
            extendedEndTime: maxEndTime,
            // For this spec we allow only a single extension to the cap.
            extensionCount: 1,
          },
        },
      )
      .exec();

    if (upd.modifiedCount !== 1) {
      return { extended: false };
    }

    // Domain event: round extended (Telegram-like payload)
    this.eventBus.publish(
      new RoundExtendedEvent({
        auctionId: String(round.auctionId),
        roundId: String(round._id),
        roundNumber: round.roundNumber,
        oldEndsAt,
        newEndsAt: maxEndTime,
        reason: 'late_bid_in_topN',
        topN,
      }),
    );

    return { extended: true, oldEndsAt, newEndsAt: maxEndTime, topN };
  }
}
