import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuctionsController } from './auctions.controller';
import { AuctionsService } from './auctions.service';
import { Auction, AuctionSchema } from './schemas/auction.schema';
import { AuthModule } from '../auth/auth.module';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { AuctionLobbyCacheService } from './auction-lobby-cache.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Auction.name, schema: AuctionSchema }]),
    RepositoriesModule,
    AuthModule,
  ],
  controllers: [AuctionsController],
  providers: [AuctionsService, AuctionLobbyCacheService],
  exports: [AuctionsService, AuctionLobbyCacheService],
})
export class AuctionsModule {}
