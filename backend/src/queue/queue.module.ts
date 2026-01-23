import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('QUEUE_REDIS_HOST') || configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('QUEUE_REDIS_PORT') || configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('QUEUE_REDIS_PASSWORD') || configService.get<string>('REDIS_PASSWORD');
        const db = configService.get<number>('QUEUE_REDIS_DB', 1);

        return {
          connection: {
            host,
            port,
            password,
            db,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: {
              age: 3600, 
              count: 1000,
            },
            removeOnFail: {
              age: 86400, 
            },
          },
        };
      },
      inject: [ConfigService],
    }),
    
    BullModule.registerQueue({ name: 'complete-round' }),
    BullModule.registerQueue({ name: 'outbox-dispatch' }),
    BullModule.registerQueue({ name: 'bid-intake' }),
    BullModule.registerQueue({ name: 'bot-bid' }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
