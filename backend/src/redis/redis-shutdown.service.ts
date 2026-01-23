import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisShutdownService.name);
  private closed = false;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      
      await this.redis.quit();
    } catch (err) {
      
      try {
        this.redis.disconnect();
      } catch {
        
      }
      
      if (process.env.NODE_ENV !== 'test') {
        this.logger.warn(`Redis shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

