import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import {
  AuctionUpdatedPayload,
  AuctionCreatedPayload,
  RoundStartedPayload,
  RoundEndedPayload,
  RoundExtendedPayload,
  BidPlacedPayload,
  LeaderboardUpdatedPayload,
  AuctionSnapshotPayload,
  AuctionAckPayload,
} from '../common/types/websocket-events.types';
import { AuctionRealtimeStateService } from './auction-realtime-state.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { validateTelegramInitData } from '../auth/telegram-initdata.util';
import { TelegramUsersService } from '../auth/telegram-users.service';
import { AuctionLobbyCacheService, LobbyTab } from '../auctions/auction-lobby-cache.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/auctions',
  
  
  pingInterval: 25000,
  pingTimeout: 20000,
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private readonly realtime: AuctionRealtimeStateService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly telegramUsers: TelegramUsersService,
    private readonly lobbyCache: AuctionLobbyCacheService,
  ) {}

  handleConnection(client: Socket): void {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Client connected: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket): void {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Client disconnected: ${client.id}`);
    }
  }

  private static readonly LOBBY_ROOM = 'auctions:lobby';

  @SubscribeMessage('join:lobby')
  handleJoinLobby(client: Socket): void {
    client.join(WebsocketGateway.LOBBY_ROOM);
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Client ${client.id} joined lobby`);
    }
  }

  @SubscribeMessage('leave:lobby')
  handleLeaveLobby(client: Socket): void {
    client.leave(WebsocketGateway.LOBBY_ROOM);
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Client ${client.id} left lobby`);
    }
  }

  /**
   * Application-level ping/pong (for clients that want explicit liveness).
   * Socket.IO already has transport-level heartbeat; this is an extra signal.
   */
  @SubscribeMessage('app:ping')
  handleAppPing(client: Socket): void {
    client.emit('app:pong', { serverTime: Date.now() });
  }

  @SubscribeMessage('sync:lobby')
  async handleSyncLobby(
    client: Socket,
    payload?: { status?: string; tab?: LobbyTab; page?: number; limit?: number },
  ): Promise<void> {
    const page = typeof payload?.page === 'number' ? payload!.page : 1;
    const limit = typeof payload?.limit === 'number' ? payload!.limit : AuctionLobbyCacheService.DEFAULT_LIMIT;
    const raw = payload?.tab || payload?.status || 'all';
    const tab: LobbyTab = raw === 'active' ? 'active' : raw === 'history' || raw === 'completed' ? 'history' : 'all';
    const result = await this.lobbyCache.getSnapshot(tab, page, limit);
    client.emit('lobby:snapshot', { ...result, tab, serverTime: Date.now() });
  }

  @SubscribeMessage('join:auction')
  async handleJoinAuction(
    client: Socket,
    payload: { auctionId: string; token?: string; initData?: string; lastSeq?: number; wantSnapshot?: boolean },
  ): Promise<void> {
    const { auctionId } = payload;
    client.join(`auction:${auctionId}`);
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Client ${client.id} joined auction ${auctionId}`);
    }

    // Optional auth (to include "me.rank" in snapshot)
    let userId: string | undefined;
    const token = (payload.token || '').trim();
    if (token) {
      try {
        const secret = this.config.get<string>('JWT_SECRET', 'dev_insecure_secret_change_me');
        const decoded = this.jwt.verify(token, { secret }) as any;
        userId = decoded?.sub ? String(decoded.sub) : undefined;
        (client.data as any).userId = userId;
      } catch {
        // ignore invalid token; snapshot will be anonymous
      }
    } else {
      const initDataRaw = (payload.initData || '').trim();
      if (initDataRaw) {
        const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
        const maxAgeSec = Number(this.config.get<string>('TELEGRAM_INITDATA_MAX_AGE_SEC', '86400'));
        const tgUser = validateTelegramInitData(initDataRaw, botToken, maxAgeSec);
        if (tgUser?.id) {
          const ensured = await this.telegramUsers.ensureTelegramUser(tgUser);
          userId = ensured.userId;
          (client.data as any).userId = userId;
        }
      }
    }

    const snapshot: AuctionSnapshotPayload = await this.realtime.buildSnapshot(auctionId, userId);
    const wantSnapshot = payload.wantSnapshot ?? true;
    const lastSeq = typeof payload.lastSeq === 'number' ? payload.lastSeq : undefined;
    if (!wantSnapshot && typeof lastSeq === 'number' && lastSeq === snapshot.seq) {
      const ack: AuctionAckPayload = { auctionId, seq: snapshot.seq, serverTime: Date.now() };
      client.emit('auction:ack', ack);
      return;
    }
    client.emit('auction:snapshot', snapshot);
  }

  @SubscribeMessage('sync:auction')
  async handleSyncAuction(
    client: Socket,
    payload: { auctionId: string; lastSeq?: number; wantSnapshot?: boolean },
  ): Promise<void> {
    const auctionId = String(payload.auctionId || '');
    const userId = (client.data as any)?.userId ? String((client.data as any).userId) : undefined;
    const snapshot: AuctionSnapshotPayload = await this.realtime.buildSnapshot(auctionId, userId);
    const wantSnapshot = payload.wantSnapshot ?? true;
    const lastSeq = typeof payload.lastSeq === 'number' ? payload.lastSeq : undefined;
    if (!wantSnapshot && typeof lastSeq === 'number' && lastSeq === snapshot.seq) {
      const ack: AuctionAckPayload = { auctionId, seq: snapshot.seq, serverTime: Date.now() };
      client.emit('auction:ack', ack);
      return;
    }
    client.emit('auction:snapshot', snapshot);
  }

  @SubscribeMessage('leave:auction')
  handleLeaveAuction(client: Socket, payload: { auctionId: string }): void {
    const { auctionId } = payload;
    client.leave(`auction:${auctionId}`);
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Client ${client.id} left auction ${auctionId}`);
    }
  }

  // Emit methods for server-side events
  emitAuctionCreated(data: AuctionCreatedPayload): void {
    this.server.to(WebsocketGateway.LOBBY_ROOM).emit('auction:created', data);
  }

  emitAuctionUpdated(auctionId: string, data: AuctionUpdatedPayload): void {
    this.server.to(`auction:${auctionId}`).emit('auction:updated', data);
  }

  emitLobbyAuctionUpdated(data: AuctionUpdatedPayload): void {
    this.server.to(WebsocketGateway.LOBBY_ROOM).emit('auction:updated', data);
  }

  emitRoundStarted(auctionId: string, data: RoundStartedPayload): void {
    this.server.to(`auction:${auctionId}`).emit('round:started', data);
  }

  emitRoundEnded(auctionId: string, data: RoundEndedPayload): void {
    this.server.to(`auction:${auctionId}`).emit('round:ended', data);
  }

  emitRoundExtended(auctionId: string, data: RoundExtendedPayload): void {
    this.server.to(`auction:${auctionId}`).emit('round:extended', data);
  }

  emitBidPlaced(auctionId: string, data: BidPlacedPayload): void {
    this.server.to(`auction:${auctionId}`).emit('bid:placed', data);
  }

  emitLeaderboardUpdated(auctionId: string, data: LeaderboardUpdatedPayload): void {
    this.server.to(`auction:${auctionId}`).emit('leaderboard:updated', data);
  }
}
