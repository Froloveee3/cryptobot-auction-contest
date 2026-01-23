import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { CacheKey, CacheValue } from '../types/cache.types';
import { MetricsService } from '../../metrics/metrics.service';


@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  
  async get<T>(key: CacheKey): Promise<T | null> {
    const keyPrefix = this.getKeyPrefix(key);
    try {
      const value = await this.redis.get(key);
      if (value) {
        
        this.metrics?.cacheOperationsTotal.labels('get', keyPrefix, 'hit').inc();
        this.metrics?.cacheHitRate.labels(keyPrefix).inc();
        const parsed = JSON.parse(value) as CacheValue<T>;
        return parsed.data;
      } else {
        
        this.metrics?.cacheOperationsTotal.labels('get', keyPrefix, 'miss').inc();
        return null;
      }
    } catch (error) {
      this.metrics?.cacheOperationsTotal.labels('get', keyPrefix, 'error').inc();
      this.logger.error(`Cache get error for key ${key}:`, error);
      return null; // Fail gracefully - return null on cache error
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(key: CacheKey, value: T, ttlSeconds: number): Promise<void> {
    const keyPrefix = this.getKeyPrefix(key);
    try {
      const cacheValue: CacheValue<T> = {
        data: value,
        timestamp: Date.now(),
        ttl: ttlSeconds,
      };
      await this.redis.setex(key, ttlSeconds, JSON.stringify(cacheValue));
      this.metrics?.cacheOperationsTotal.labels('set', keyPrefix, 'success').inc();
    } catch (error) {
      this.metrics?.cacheOperationsTotal.labels('set', keyPrefix, 'error').inc();
      this.logger.error(`Cache set error for key ${key}:`, error);
      // Fail silently - cache errors shouldn't break the application
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: CacheKey): Promise<void> {
    const keyPrefix = this.getKeyPrefix(key);
    try {
      await this.redis.del(key);
      this.metrics?.cacheOperationsTotal.labels('delete', keyPrefix, 'success').inc();
    } catch (error) {
      this.metrics?.cacheOperationsTotal.labels('delete', keyPrefix, 'error').inc();
      this.logger.error(`Cache delete error for key ${key}:`, error);
      // Fail silently
    }
  }

  /**
   * Delete multiple keys matching pattern (use with caution)
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      this.logger.error(`Cache deletePattern error for pattern ${pattern}:`, error);
      // Fail silently
    }
  }

  /**
   * Invalidate cache for auction (deletes auction and related caches)
   */
  async invalidateAuction(auctionId: string): Promise<void> {
    const keys: CacheKey[] = [
      `auction:${auctionId}` as CacheKey,
      `auction:${auctionId}:current-round` as CacheKey,
      `auction:${auctionId}:rounds` as CacheKey,
      `auction:${auctionId}:supply` as CacheKey,
    ];
    await Promise.all(keys.map((key) => this.delete(key)));
  }

  /**
   * Invalidate cache for round (deletes round and related caches)
   * Uses pattern matching to invalidate all variations (e.g., with different limits)
   */
  async invalidateRound(roundId: string): Promise<void> {
    const keys: CacheKey[] = [
      `round:${roundId}` as CacheKey,
      `round:${roundId}:bids` as CacheKey,
    ];
    await Promise.all(keys.map((key) => this.delete(key)));
    
    // Invalidate all variations with patterns (leaderboard and top-bids with different limits)
    await this.deletePattern(`round:${roundId}:leaderboard*`);
    await this.deletePattern(`round:${roundId}:top-bids*`);
  }

  /**
   * Invalidate cache for auction active round
   */
  async invalidateActiveRound(auctionId: string): Promise<void> {
    await this.delete(`auction:${auctionId}:current-round` as CacheKey);
  }

  /**
   * Helper: Get or set with cache
   * Fetches from cache, or calls factory and caches result
   */
  async getOrSet<T>(
    key: CacheKey,
    factory: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Extract key prefix from cache key for metrics
   */
  private getKeyPrefix(key: CacheKey): string {
    const parts = key.split(':');
    return parts.length > 1 ? `${parts[0]}:${parts[1]}` : parts[0] || 'unknown';
  }
}
