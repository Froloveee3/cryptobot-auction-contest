import { Injectable } from '@nestjs/common';
import { CacheService } from '../common/services/cache.service';
import { CACHE_TTL } from '../common/types/cache.types';
import { AuctionRepository } from '../common/repositories/auction.repository';
import { RoundRepository } from '../common/repositories/round.repository';
import { IAuction, AuctionStatus } from '../common/types/entities.types';
import { PaginatedResponseDto } from '../common/types/dto.types';

export type LobbyTab = 'active' | 'all' | 'history';

@Injectable()
export class AuctionLobbyCacheService {
  static readonly DEFAULT_LIMIT = 10;

  constructor(
    private readonly cache: CacheService,
    private readonly auctions: AuctionRepository,
    private readonly rounds: RoundRepository,
  ) {}

  private getKey(tab: LobbyTab, page: number, limit: number): `lobby:${string}:${number}:${number}` {
    return `lobby:${tab}:${page}:${limit}`;
  }

  private getFilter(tab: LobbyTab): Record<string, any> {
    if (tab === 'active') {
      return { status: 'active' as AuctionStatus };
    }
    if (tab === 'history') {
      return { status: { $in: ['completed', 'cancelled'] } };
    }
    return { status: { $ne: 'draft' } };
  }

  private getSort(tab: LobbyTab): Record<string, 1 | -1> {
    if (tab === 'active') {
      return { startedAt: -1, createdAt: -1 };
    }
    if (tab === 'history') {
      return { endedAt: -1, createdAt: -1 };
    }
    return { createdAt: -1 };
  }

  private async buildSnapshot(
    tab: LobbyTab,
    page: number,
    limit: number,
  ): Promise<PaginatedResponseDto<IAuction>> {
    const { data, total } = await this.auctions.findPage(
      this.getFilter(tab),
      this.getSort(tab),
      page,
      limit,
    );
    const enriched = await this.enrichAuctions(tab, data);
    return {
      data: enriched.map((item) => ({ ...item, id: item._id, _id: item._id })) as IAuction[],
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async enrichAuctions(tab: LobbyTab, items: IAuction[]): Promise<Array<IAuction & { remainingSupply?: number; currentRoundEndsAt?: Date | null }>> {
    const withSupply = items.map((item) => {
      const totalSupply = Number(item.totalRounds) * Number(item.winnersPerRound);
      const remainingSupply = Math.max(0, totalSupply - Number(item.totalGiftsDistributed ?? 0));
      return { ...item, remainingSupply };
    });

    if (tab === 'history') {
      return withSupply.map((item) => ({ ...item, currentRoundEndsAt: null }));
    }

    const ids = withSupply.map((item) => item._id);
    const rounds = await this.rounds.findActiveByAuctionIds(ids);
    const endsByAuction = new Map<string, Date | null>();
    for (const round of rounds) {
      const endsAt = (round.extendedEndTime ?? round.endTime) as Date | undefined;
      endsByAuction.set(round.auctionId, endsAt ?? null);
    }
    return withSupply.map((item) => ({
      ...item,
      currentRoundEndsAt: endsByAuction.get(item._id) ?? null,
    }));
  }

  async getSnapshot(tab: LobbyTab, page = 1, limit = AuctionLobbyCacheService.DEFAULT_LIMIT) {
    const key = this.getKey(tab, page, limit);
    return this.cache.getOrSet(key, () => this.buildSnapshot(tab, page, limit), CACHE_TTL.LOBBY);
  }

  async rebuildAll(limit = AuctionLobbyCacheService.DEFAULT_LIMIT): Promise<Array<{ tab: LobbyTab; snapshot: PaginatedResponseDto<IAuction> }>> {
    const tabs: LobbyTab[] = ['active', 'all', 'history'];
    const out: Array<{ tab: LobbyTab; snapshot: PaginatedResponseDto<IAuction> }> = [];
    for (const tab of tabs) {
      const first = await this.buildSnapshot(tab, 1, limit);
      await this.cache.set(this.getKey(tab, 1, limit), first, CACHE_TTL.LOBBY);
      out.push({ tab, snapshot: first });
      const totalPages = Math.max(1, first.totalPages);
      for (let page = 2; page <= totalPages; page += 1) {
        const snapshot = await this.buildSnapshot(tab, page, limit);
        await this.cache.set(this.getKey(tab, page, limit), snapshot, CACHE_TTL.LOBBY);
        out.push({ tab, snapshot });
      }
    }
    return out;
  }
}
