import { Module, Global } from '@nestjs/common';
import { CacheService } from './services/cache.service';
import { RedisModule } from '../redis/redis.module';
import { CacheEventsHandler } from './events/handlers/cache-events.handler';

@Global()
@Module({
  imports: [RedisModule],
  providers: [CacheService, CacheEventsHandler],
  exports: [CacheService],
})
export class CommonModule {}
