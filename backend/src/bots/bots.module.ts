import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BotsService } from './bots.service';
import { BotsController } from './bots.controller';
import { Bot, BotSchema } from './schemas/bot.schema';
import { BotRoundEventsHandler } from './bot-round-events.handler';
import { BotBidProcessor } from './bot-bid.processor';
import { BidsModule } from '../bids/bids.module';
import { AuctionsModule } from '../auctions/auctions.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Bot.name, schema: BotSchema }]),
    AuthModule,
    BidsModule,
    AuctionsModule,
    UsersModule,
  ],
  controllers: [BotsController],
  providers: [BotsService, BotRoundEventsHandler, BotBidProcessor],
  exports: [BotsService],
})
export class BotsModule {}
