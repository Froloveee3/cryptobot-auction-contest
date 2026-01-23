import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AuctionBusyError } from '../common/types/domain-errors.types';


@Injectable()
export class AuctionBidShedderService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  private key(auctionId: string, bucketSec: number): string {
    return `auction:${auctionId}:shed:sec:${bucketSec}`;
  }

  async assertNotOverloaded(auctionId: string): Promise<void> {
    const enabled = this.config.get<string>('AUCTION_BID_SHEDDER_ENABLED', 'false') === 'true';
    if (!enabled) return;

    const limit = Number(this.config.get<string>('AUCTION_BID_RPS_LIMIT', '2000'));
    if (!Number.isFinite(limit) || limit <= 0) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const key = this.key(auctionId, nowSec);

    // INCR + EXPIRE (best effort). Overhead is tiny compared to Mongo tx.
    const n = await this.redis.incr(key);
    if (n === 1) {
      // Set TTL only on first hit.
      await this.redis.expire(key, 2).catch(() => undefined);
    }

    if (n > limit) {
      throw new AuctionBusyError(auctionId);
    }
  }
}

