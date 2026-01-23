import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisShutdownService } from './redis-shutdown.service';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger('Redis');
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('REDIS_PASSWORD');
        const db = configService.get<number>('REDIS_DB', 0);

        const redis = new Redis({
          host,
          port,
          password,
          db,
          retryStrategy: (times: number): number => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: true,
        });

        redis.on('error', (error: Error) => {
          logger.error(`Redis connection error: ${error.message}`, error.stack);
        });

        redis.on('connect', () => {
          logger.log('Redis connected');
        });

        return redis;
      },
      inject: [ConfigService],
    },
    RedisShutdownService,
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
