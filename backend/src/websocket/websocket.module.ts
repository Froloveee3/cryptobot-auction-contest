import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { WebsocketEventsHandler } from './websocket-events.handler';
import { AuctionRealtimeStateService } from './auction-realtime-state.service';
import { AuctionRealtimeEventsHandler } from './auction-realtime-events.handler';
import { RepositoriesModule } from '../common/repositories/repositories.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { AuctionsModule } from '../auctions/auctions.module';

@Module({
  imports: [RepositoriesModule, UsersModule, AuthModule, AuctionsModule],
  providers: [WebsocketGateway, WebsocketEventsHandler, AuctionRealtimeStateService, AuctionRealtimeEventsHandler],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}
