import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';
import { AuctionBidShedderService } from './auction-bid-shedder.service';
import { BidIntakeService } from './bid-intake.service';
import { BidIntakeProcessor } from './bid-intake.processor';
import { BidIntakeQueueMetricsService } from './bid-intake-queue-metrics.service';
import { BidIntakeLagShedderService } from './bid-intake-lag-shedder.service';
import { BidIntakeSmartAdmissionService } from './bid-intake-smart-admission.service';
import { BidIntakeUserFairnessService } from './bid-intake-user-fairness.service';
import { Bid, BidSchema } from './schemas/bid.schema';
import { BidIdempotency, BidIdempotencySchema } from './schemas/bid-idempotency.schema';
import { Round, RoundSchema } from '../rounds/schemas/round.schema';
import { BalanceModule } from '../balance/balance.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Bid.name, schema: BidSchema },
      { name: BidIdempotency.name, schema: BidIdempotencySchema },
      
      { name: Round.name, schema: RoundSchema },
    ]),
    RepositoriesModule,
    AuthModule,
    BalanceModule,
    UsersModule,
    MetricsModule,
  ],
  controllers: [BidsController],
  providers: [
    BidsService,
    AuctionBidShedderService,
    BidIntakeService,
    BidIntakeProcessor,
    BidIntakeQueueMetricsService,
    BidIntakeLagShedderService,
    BidIntakeSmartAdmissionService,
    BidIntakeUserFairnessService,
  ],
  exports: [BidsService],
})
export class BidsModule {}
