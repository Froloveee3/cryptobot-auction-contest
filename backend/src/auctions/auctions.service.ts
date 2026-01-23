import { Injectable, NotFoundException } from '@nestjs/common';
import { IAuction, IRound } from '../common/types/entities.types';
import {
  CreateAuctionDto,
  GetAuctionsQueryDto,
  PaginatedResponseDto,
} from '../common/types/dto.types';
import { IAuctionService } from '../common/types/service.types';
import { getRoundParams } from '../common/utils/schedule.helper';
import { CacheService } from '../common/services/cache.service';
import { CACHE_TTL } from '../common/types/cache.types';
import { AuctionRepository } from '../common/repositories/auction.repository';
import { RoundRepository } from '../common/repositories/round.repository';
import { EventBusService } from '../common/services/event-bus.service';
import { RoundStartedEvent } from '../common/events/round.events';
import { AuctionCreatedEvent, AuctionStartedEvent, AuctionUpdatedEvent } from '../common/events/auction.events';
import { AuctionLobbyCacheService, LobbyTab } from './auction-lobby-cache.service';

@Injectable()
export class AuctionsService implements IAuctionService {
  constructor(
    private auctionRepository: AuctionRepository,
    private roundRepository: RoundRepository,
    private cacheService: CacheService,
    private eventBus: EventBusService,
    private lobbyCache: AuctionLobbyCacheService,
  ) {}

  async create(data: CreateAuctionDto, userId?: string): Promise<IAuction> {
    const botsCountRaw = (data as any).botsCount;
    const botsCount =
      botsCountRaw === undefined || botsCountRaw === null || botsCountRaw === ''
        ? undefined
        : Number(botsCountRaw);
    const draftPayload: Partial<IAuction> = {
      ...data,
      createdBy: userId ?? null,
      status: 'draft',
      currentRound: 0,
      totalGiftsDistributed: 0,
      minBid: data.minBid ?? 1,
      minIncrement: data.minIncrement ?? 1,
      antiSnipingWindow: data.antiSnipingWindow ?? 10,
      antiSnipingExtension: data.antiSnipingExtension ?? 30,
      
      maxRoundExtensions: data.maxRoundExtensions ?? 1,
      botsEnabled: Boolean((data as any).botsEnabled),
      botsCount: Number.isFinite(botsCount as any) ? Math.max(0, botsCount as number) : undefined,
    };

    if (userId) {
      const existing = await this.auctionRepository.findDraftByCreator(userId);
      if (existing) {
        const updated = await this.auctionRepository.updateById(existing._id, draftPayload);
        return updated ?? existing;
      }
    }

    const saved = await this.auctionRepository.create(draftPayload);

    
    if (saved.status !== 'draft') {
      this.eventBus.publish(
        new AuctionCreatedEvent(saved._id, {
          _id: saved._id,
          title: saved.title,
          description: saved.description,
          status: saved.status,
          totalRounds: saved.totalRounds,
          currentRound: saved.currentRound,
          winnersPerRound: saved.winnersPerRound,
          roundDuration: saved.roundDuration,
          minBid: saved.minBid,
          minIncrement: saved.minIncrement,
          antiSnipingWindow: saved.antiSnipingWindow,
          antiSnipingExtension: saved.antiSnipingExtension,
          maxRoundExtensions: saved.maxRoundExtensions,
          totalGiftsDistributed: saved.totalGiftsDistributed,
          createdAt: saved.createdAt,
          startedAt: saved.startedAt,
          endedAt: saved.endedAt,
        }),
      );
    }
    return saved;
  }

  async findById(id: string): Promise<IAuction | null> {
    const cacheKey = `auction:${id}` as const;
    
    // Try cache first
    const cached = await this.cacheService.get<IAuction>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from DB
    const auction = await this.auctionRepository.findById(id);
    if (!auction) {
      return null;
    }

    // Cache the result
    await this.cacheService.set(cacheKey, auction, CACHE_TTL.AUCTION);

    return auction;
  }

  async findAll(
    query: GetAuctionsQueryDto,
    requester?: { userId?: string; roles?: Array<'user' | 'admin'> },
  ): Promise<PaginatedResponseDto<IAuction>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? AuctionLobbyCacheService.DEFAULT_LIMIT;
    const roles = requester?.roles ?? [];
    const isAdmin = roles.includes('admin');

    if (query.status === 'draft' && !isAdmin) {
      return { data: [], page, limit, total: 0, totalPages: 0 };
    }

    if (query.status === 'draft' && isAdmin) {
      const { data, total } = await this.auctionRepository.findPage(
        { status: 'draft' },
        { createdAt: -1 },
        page,
        limit,
      );
      return {
        data: data.map((item) => ({ ...item, id: item._id, _id: item._id })) as IAuction[],
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      };
    }

    const rawStatus = query.status;
    const tab: LobbyTab =
      rawStatus === 'active' ? 'active' : rawStatus === 'history' || rawStatus === 'completed' ? 'history' : 'all';
    return this.lobbyCache.getSnapshot(tab, page, limit);
  }

  async getMyDraft(userId: string): Promise<IAuction | null> {
    return this.auctionRepository.findDraftByCreator(userId);
  }

  async start(id: string): Promise<IAuction> {
    const auction = await this.auctionRepository.findById(id);
    if (!auction) {
      throw new NotFoundException(`Auction with ID ${id} not found`);
    }

    if (auction.status !== 'draft') {
      throw new Error('Auction can only be started from draft status');
    }

    // Strict validation on start (draft can be partially empty).
    const title = String(auction.title ?? '').trim();
    const description = String(auction.description ?? '').trim();
    if (!title || !description) {
      throw new Error('Auction title and description are required to start');
    }
    if (!Number.isFinite(auction.totalRounds) || auction.totalRounds < 1) {
      throw new Error('Auction totalRounds must be >= 1 to start');
    }
    if (!Number.isFinite(auction.winnersPerRound) || auction.winnersPerRound < 1) {
      throw new Error('Auction winnersPerRound must be >= 1 to start');
    }
    if (!Number.isFinite(auction.roundDuration) || auction.roundDuration < 1) {
      throw new Error('Auction roundDuration must be >= 1 to start');
    }
    if (!Number.isFinite(auction.minBid) || auction.minBid < 1) {
      throw new Error('Auction minBid must be >= 1 to start');
    }
    if (!Number.isFinite(auction.minIncrement) || auction.minIncrement < 1) {
      throw new Error('Auction minIncrement must be >= 1 to start');
    }
    if (!Number.isFinite(auction.antiSnipingExtension) || auction.antiSnipingExtension < 1) {
      throw new Error('Auction antiSnipingExtension must be >= 1 to start');
    }
    if (!Number.isFinite(auction.antiSnipingWindow) || auction.antiSnipingWindow < 1) {
      throw new Error('Auction antiSnipingWindow must be >= 1 to start');
    }
    if (!Number.isFinite(auction.maxRoundExtensions) || auction.maxRoundExtensions < 0) {
      throw new Error('Auction maxRoundExtensions must be >= 0 to start');
    }

    const startedAt = new Date();
    const updated = await this.auctionRepository.updateById(id, {
      status: 'active',
      startedAt,
      currentRound: 1,
    } as Partial<IAuction>);

    if (!updated) {
      throw new NotFoundException(`Auction with ID ${id} not found`);
    }

    // Domain event: auction started
    this.eventBus.publish(new AuctionStartedEvent(updated._id, updated.title));

    // Invalidate cache
    await this.cacheService.invalidateAuction(id);

    // Create and start first round (synchronously, no dependency on RoundsService)
    const roundParams = getRoundParams(updated, 1);
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + roundParams.duration * 1000);

    // Idempotency: if first round already exists, don't duplicate it (e.g. retry).
    const existing = await this.roundRepository.findByAuctionAndNumber(id, 1);
    const round =
      existing ??
      (await this.roundRepository.create({
        auctionId: id,
        roundNumber: 1,
        status: 'active',
        startTime,
        endTime,
        extendedEndTime: null,
        extensionCount: 0,
        winnersCount: roundParams.winnersPerRound,
        roundDuration: roundParams.duration,
        antiSnipingWindow: roundParams.antiSnipingWindow,
        antiSnipingExtension: roundParams.antiSnipingExtension,
        maxRoundExtensions: roundParams.maxRoundExtensions,
        participants: [],
        winners: [],
        completedAt: null,
        lastBidAt: null,
      } as Partial<IRound>));

    // Invalidate active round cache (round is now active)
    await this.cacheService.invalidateActiveRound(id);

    // Domain event: round started (WebSocket + observers)
    this.eventBus.publish(
      new RoundStartedEvent(id, {
        auctionId: id,
        roundId: round._id,
        roundNumber: round.roundNumber,
        startTime: round.startTime!,
        endTime: (round.extendedEndTime ?? round.endTime)!,
      }),
    );

    const totalSupply = Number(updated.totalRounds) * Number(updated.winnersPerRound);
    const remainingSupply = Math.max(0, totalSupply - Number(updated.totalGiftsDistributed ?? 0));
    this.eventBus.publish(
      new AuctionUpdatedEvent(updated._id, {
        ...updated,
        _id: updated._id,
        status: updated.status,
        remainingSupply,
        currentRoundEndsAt: (round.extendedEndTime ?? round.endTime) ?? null,
      }),
    );

    return updated;
  }

  async getCurrentRound(auctionId: string): Promise<IRound | null> {
    return this.roundRepository.findActiveByAuctionId(auctionId);
  }

  async getRounds(auctionId: string): Promise<IRound[]> {
    return this.roundRepository.findByAuctionId(auctionId);
  }
}
