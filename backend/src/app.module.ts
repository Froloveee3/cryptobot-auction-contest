import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { CommonModule } from './common/common.module';
import { RepositoriesModule } from './common/repositories/repositories.module';
import { LoggerModule } from './common/logger.module';
import { EventsModule } from './common/events/events.module';
import { UsersModule } from './users/users.module';
import { AuctionsModule } from './auctions/auctions.module';
import { RoundsModule } from './rounds/rounds.module';
import { BidsModule } from './bids/bids.module';
import { BalanceModule } from './balance/balance.module';
import { WebsocketModule } from './websocket/websocket.module';
import { BotsModule } from './bots/bots.module';
import { MetricsModule } from './metrics/metrics.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import * as path from 'path';
import { RateLimitGuard } from './common/guards/rate-limit.guard';

@Module({
  imports: [
    
    ConfigModule.forRoot({
      isGlobal: true,
      
      
      ignoreEnvFile: (process.env.NODE_ENV || '').toLowerCase() === 'test',
      envFilePath: (() => {
        const env = process.env.NODE_ENV || 'development';
        const cwd = process.cwd();
        const inBackendDir = path.basename(cwd) === 'backend' || cwd.endsWith(`${path.sep}backend`);
        const prefix = inBackendDir ? '' : `backend${path.sep}`;

        // Highest priority: module-local env files (backend/.env.*) if running from repo root.
        // Fallback: root .env.* (useful for docker-compose hybrid runs and simple local runs).
        return [
          `${prefix}.env.${env}.local`,
          `${prefix}.env.${env}`,
          `${prefix}.env.local`,
          `${prefix}.env`,
          `.env.${env}.local`,
          `.env.${env}`,
          '.env.local',
          '.env',
        ];
      })(),
    }),
    AppConfigModule,

    // Database
    DatabaseModule,

    // Redis
    RedisModule,

    // Queue
    QueueModule,

    // Common services (CacheService, etc.)
    CommonModule,

    // Repositories
    RepositoriesModule,

    // Logging
    LoggerModule,

    // Domain Events
    EventsModule,

    // Health checks
    TerminusModule,

    // Feature modules
    UsersModule,
    AuctionsModule,
    RoundsModule,
    BidsModule,
    BalanceModule,
    WebsocketModule,
    BotsModule,
    MetricsModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, RateLimitGuard],
})
export class AppModule {}
