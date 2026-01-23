import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Auction, AuctionSchema } from '../../auctions/schemas/auction.schema';
import { Round, RoundSchema } from '../../rounds/schemas/round.schema';
import { Bid, BidSchema } from '../../bids/schemas/bid.schema';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { AuctionRepository } from './auction.repository';
import { RoundRepository } from './round.repository';
import { BidRepository } from './bid.repository';
import { UserRepository } from './user.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Auction.name, schema: AuctionSchema },
      { name: Round.name, schema: RoundSchema },
      { name: Bid.name, schema: BidSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [AuctionRepository, RoundRepository, BidRepository, UserRepository],
  exports: [AuctionRepository, RoundRepository, BidRepository, UserRepository],
})
export class RepositoriesModule {}
