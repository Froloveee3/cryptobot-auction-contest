import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { CommonModule } from './common/common.module';
import { RepositoriesModule } from './common/repositories/repositories.module';
import { LoggerModule } from './common/logger.module';
import { EventsCoreModule } from './common/events/events-core.module';
import { MetricsModule } from './metrics/metrics.module';
import { UsersModule } from './users/users.module';
import { BalanceModule } from './balance/balance.module';
import { BidsModule } from './bids/bids.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: (process.env.NODE_ENV || '').toLowerCase() === 'test',
    }),
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    CommonModule,
    RepositoriesModule,
    LoggerModule,
    EventsCoreModule,
    MetricsModule,
    UsersModule,
    BalanceModule,
    BidsModule,
  ],
})
export class WorkerModule {}

