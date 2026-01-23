import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoundsService } from './rounds.service';
import { RoundsProcessor } from './rounds.processor';
import { RoundsRecoveryService } from './rounds.recovery.service';
import { WinnerCalculationService } from './services/winner-calculation.service';
import { BidStatusUpdateService } from './services/bid-status-update.service';
import { RoundCompletionOrchestrator } from './services/round-completion-orchestrator.service';
import { Round, RoundSchema } from './schemas/round.schema';
import { Auction, AuctionSchema } from '../auctions/schemas/auction.schema';
import { Bid, BidSchema } from '../bids/schemas/bid.schema';
import { BalanceModule } from '../balance/balance.module';
import { MetricsModule } from '../metrics/metrics.module';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { RoundJobsService } from './round-jobs.service';
import { RoundJobsEventsHandler } from './round-jobs-events.handler';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Round.name, schema: RoundSchema },
      { name: Auction.name, schema: AuctionSchema },
      { name: Bid.name, schema: BidSchema },
    ]),
    RepositoriesModule,
    BalanceModule,
    MetricsModule,
  ],
  providers: [
    RoundsService,
    RoundsProcessor,
    RoundsRecoveryService,
    WinnerCalculationService,
    BidStatusUpdateService,
    RoundCompletionOrchestrator,
    RoundJobsService,
    RoundJobsEventsHandler,
  ],
  exports: [RoundsService],
})
export class RoundsModule {}
