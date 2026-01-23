

import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../config/api';
import type {
  AuctionSnapshotPayload,
  AuctionPatchPayload,
  BidPlacedPayload,
  RoundStartedPayload,
  RoundExtendedPayload,
  RoundEndedPayload,
  AuctionCreatedPayload,
  LobbySnapshotPayload,
  AppPongPayload,
} from '../contracts/ws';
import {
  normalizeAuctionCreated,
  normalizeSnapshotRound,
  normalizePatchRound,
  normalizeBidPlaced,
  normalizeRoundStarted,
  normalizeRoundExtended,
} from '../contracts/ws';

export type WSEventHandlers = {
  
  onAuctionCreated?: (payload: AuctionCreatedPayload) => void;
  onLobbySnapshot?: (payload: LobbySnapshotPayload) => void;

  
  onAuctionSnapshot?: (payload: AuctionSnapshotPayload) => void;
  onAuctionPatch?: (payload: AuctionPatchPayload) => void;
  onBidPlaced?: (payload: BidPlacedPayload) => void;
  onRoundStarted?: (payload: RoundStartedPayload) => void;
  onRoundExtended?: (payload: RoundExtendedPayload) => void;
  onRoundEnded?: (payload: RoundEndedPayload) => void;
  onAuctionUpdated?: (payload: { _id: string; status: string; [key: string]: any }) => void;

  
  onPong?: (payload: AppPongPayload) => void;
};

type RoomType = 'lobby' | 'auction';

interface RoomState {
  type: RoomType;
  auctionId?: string;
  lastEventAt: number;
  lastSeq?: number;
  joined: boolean;
}

class WebSocketManager {
  private socket: Socket | null = null;
  private heartbeatTimer: number | null = null;
  private resyncTimer: number | null = null;
  private lastPongAt = 0;
  private handlers: WSEventHandlers = {};
  private rooms: Map<string, RoomState> = new Map();
  private isPageVisible = true;
  private authToken: string | null = null;
  private telegramInitData: string | null = null;
  private pendingLobbySync: { page?: number; limit?: number; tab?: 'active' | 'all' | 'history'; status?: string } | null = null;

  
  private readonly HEARTBEAT_INTERVAL = 20000; 
  private readonly HEARTBEAT_SILENCE_THRESHOLD = 65000; 
  private readonly RESYNC_INACTIVITY_THRESHOLD = 30000; 
  private readonly RESYNC_INACTIVITY_THRESHOLD_AUCTION = 30000; 
  private readonly RESYNC_CHECK_INTERVAL = 10000; 

  constructor() {
    
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.isPageVisible = !document.hidden;
        this.updateHeartbeat();
      });
    }
  }

  
  connect(): Socket {
    if (!this.socket) {
      const wsUrl = WS_URL.replace('ws://', 'http://').replace('wss://', 'https://');
      this.socket = io(`${wsUrl}/auctions`, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });

      this.setupEventHandlers();
      this.setupReconnectHandlers();
      this.updateHeartbeat();
      this.startResyncCheck();
    }
    return this.socket;
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.stopHeartbeat();
    this.stopResyncCheck();
    this.rooms.clear();
  }

  /**
   * Set authentication (JWT token or Telegram initData)
   */
  setAuth(token: string | null, telegramInitData: string | null = null): void {
    this.authToken = token;
    this.telegramInitData = telegramInitData;
  }

  /**
   * Set event handlers
   */
  setHandlers(handlers: WSEventHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Join lobby room
   */
  joinLobby(): void {
    if (!this.socket || !this.socket.connected) {
      this.connect();
    }
    const roomKey = 'lobby';
    if (!this.rooms.has(roomKey)) {
      this.rooms.set(roomKey, {
        type: 'lobby',
        lastEventAt: Date.now(),
        joined: false,
      });
      if (this.socket?.connected) {
        this.socket.emit('join:lobby');
        const room = this.rooms.get(roomKey);
        if (room) room.joined = true;
      }
    }
  }

  /**
   * Leave lobby room
   */
  leaveLobby(): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('leave:lobby');
    }
    this.rooms.delete('lobby');
  }

  /**
   * Join auction room
   */
  joinAuction(auctionId: string, options?: { wantSnapshot?: boolean; lastSeq?: number }): void {
    if (!this.socket || !this.socket.connected) {
      this.connect();
    }
    const roomKey = `auction:${auctionId}`;
    if (!this.rooms.has(roomKey)) {
      const payload: any = {
        auctionId,
        wantSnapshot: options?.wantSnapshot ?? true,
      };
      if (this.authToken) {
        payload.token = this.authToken;
      } else if (this.telegramInitData) {
        payload.initData = this.telegramInitData;
      }
      if (options?.lastSeq !== undefined) {
        payload.lastSeq = options.lastSeq;
      }

      this.rooms.set(roomKey, {
        type: 'auction',
        auctionId,
        lastEventAt: Date.now(),
        lastSeq: options?.lastSeq,
        joined: false,
      });
      if (this.socket?.connected) {
        this.socket.emit('join:auction', payload);
        const room = this.rooms.get(roomKey);
        if (room) room.joined = true;
      }
    }
  }

  /**
   * Leave auction room
   */
  leaveAuction(auctionId: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('leave:auction', { auctionId });
    }
    this.rooms.delete(`auction:${auctionId}`);
  }

  /**
   * Request lobby snapshot (resync)
   */
  syncLobby(options?: { page?: number; limit?: number; tab?: 'active' | 'all' | 'history'; status?: string }): void {
    if (!this.socket || !this.socket.connected) {
      this.pendingLobbySync = options || {};
      this.connect();
      return;
    }
    this.socket.emit('sync:lobby', options || {});
  }

  /**
   * Request auction snapshot (resync)
   */
  syncAuction(auctionId: string, lastSeq?: number): void {
    if (!this.socket || !this.socket.connected) {
      return;
    }
    const payload: any = { auctionId, wantSnapshot: true };
    if (this.authToken) {
      payload.token = this.authToken;
    } else if (this.telegramInitData) {
      payload.initData = this.telegramInitData;
    }
    if (lastSeq !== undefined) {
      payload.lastSeq = lastSeq;
    }
    this.socket.emit('sync:auction', payload);
  }

  /**
   * Get current socket instance
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Private methods

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Heartbeat
    this.socket.on('app:pong', (payload: AppPongPayload) => {
      this.lastPongAt = Date.now();
      this.handlers.onPong?.(payload);
    });

    // Lobby events
    this.socket.on('auction:created', (payload: AuctionCreatedPayload) => {
      const normalized = normalizeAuctionCreated(payload);
      this.updateRoomActivity('lobby');
      this.handlers.onAuctionCreated?.(normalized);
    });

    this.socket.on('lobby:snapshot', (payload: LobbySnapshotPayload) => {
      this.updateRoomActivity('lobby');
      this.handlers.onLobbySnapshot?.(payload);
    });

    // Auction events
    this.socket.on('auction:snapshot', (payload: AuctionSnapshotPayload) => {
      const roomKey = `auction:${payload.auctionId}`;
      const room = this.rooms.get(roomKey);
      if (room) {
        room.lastSeq = payload.seq;
        room.lastEventAt = Date.now();
      }
      // Normalize dates in currentRound (already normalized by normalizeSnapshotRound)
      const normalized = {
        ...payload,
        currentRound: normalizeSnapshotRound(payload.currentRound),
      };
      this.handlers.onAuctionSnapshot?.(normalized as AuctionSnapshotPayload);
    });

    this.socket.on('auction:patch', (payload: AuctionPatchPayload) => {
      const roomKey = `auction:${payload.auctionId}`;
      const room = this.rooms.get(roomKey);
      if (room) {
        room.lastSeq = payload.seq;
        room.lastEventAt = Date.now();
      }
      // Normalize dates if present (already normalized by normalizePatchRound)
      const normalized = {
        ...payload,
        currentRound: payload.currentRound ? normalizePatchRound(payload.currentRound) : undefined,
      };
      this.handlers.onAuctionPatch?.(normalized as AuctionPatchPayload);
    });

    this.socket.on('bid:placed', (payload: BidPlacedPayload) => {
      const normalized = normalizeBidPlaced(payload);
      this.updateRoomActivity(`auction:${payload.auctionId}`);
      this.handlers.onBidPlaced?.(normalized);
    });

    this.socket.on('round:started', (payload: RoundStartedPayload) => {
      const normalized = normalizeRoundStarted(payload);
      const roomKey = normalized.auctionId ? `auction:${normalized.auctionId}` : null;
      if (roomKey) {
        this.updateRoomActivity(roomKey);
      } else {
        // Fallback: mark all auction rooms active
        this.rooms.forEach((room, key) => {
          if (room.type === 'auction') {
            this.updateRoomActivity(key);
          }
        });
      }
      this.handlers.onRoundStarted?.(normalized);
    });

    this.socket.on('round:extended', (payload: RoundExtendedPayload) => {
      const normalized = normalizeRoundExtended(payload);
      const roomKey = `auction:${payload.auctionId}`;
      this.updateRoomActivity(roomKey);
      this.handlers.onRoundExtended?.(normalized);
    });

    this.socket.on('round:ended', (payload: RoundEndedPayload) => {
      // Find auction room for this round
      this.rooms.forEach((room, key) => {
        if (room.type === 'auction') {
          this.updateRoomActivity(key);
        }
      });
      this.handlers.onRoundEnded?.(payload);
    });

    this.socket.on('auction:updated', (payload: any) => {
      this.updateRoomActivity('lobby');
      // Find auction room
      this.rooms.forEach((room, key) => {
        if (room.type === 'auction' && payload._id === room.auctionId) {
          this.updateRoomActivity(key);
        }
      });
      this.handlers.onAuctionUpdated?.(payload);
    });

    this.socket.on('connect', () => {
      this.lastPongAt = Date.now();
      this.handleReconnect();
      if (this.pendingLobbySync) {
        this.socket!.emit('sync:lobby', this.pendingLobbySync);
        this.pendingLobbySync = null;
      }
    });

    this.socket.on('disconnect', () => {
      this.rooms.forEach((room) => {
        room.joined = false;
      });
      this.stopHeartbeat();
    });
  }

  private setupReconnectHandlers(): void {
    if (!this.socket) return;

    this.socket.on('reconnect', () => {
      this.lastPongAt = Date.now();
      this.handleReconnect();
    });
  }

  private handleReconnect(): void {
    // Rejoin all rooms on reconnect
    this.rooms.forEach((room, key) => {
      if (room.type === 'lobby') {
        if (!room.joined) {
          this.socket!.emit('join:lobby');
          room.joined = true;
        }
      } else if (room.type === 'auction' && room.auctionId) {
        const payload: any = {
          auctionId: room.auctionId,
          wantSnapshot: true,
        };
        if (this.authToken) {
          payload.token = this.authToken;
        } else if (this.telegramInitData) {
          payload.initData = this.telegramInitData;
        }
        if (room.lastSeq !== undefined) {
          payload.lastSeq = room.lastSeq;
        }
        if (!room.joined) {
          this.socket!.emit('join:auction', payload);
          room.joined = true;
        }
      }
    });
  }

  private updateRoomActivity(roomKey: string): void {
    const room = this.rooms.get(roomKey);
    if (room) {
      room.lastEventAt = Date.now();
    }
  }

  private updateHeartbeat(): void {
    if (!this.isPageVisible) {
      // Page is hidden - stop heartbeat
      this.stopHeartbeat();
      return;
    }

    // Page is visible - start/restart heartbeat
    if (!this.heartbeatTimer && this.socket?.connected) {
      this.heartbeatTimer = window.setInterval(() => {
        if (!this.socket || !this.socket.connected) {
          this.stopHeartbeat();
          return;
        }

        // Send ping
        this.socket.emit('app:ping');

        // Check if we haven't received pong for too long
        if (Date.now() - this.lastPongAt > this.HEARTBEAT_SILENCE_THRESHOLD) {
          // Force reconnect
          this.socket.disconnect();
          this.socket.connect();
        }
      }, this.HEARTBEAT_INTERVAL);
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startResyncCheck(): void {
    if (this.resyncTimer !== null) {
      return;
    }

    this.resyncTimer = window.setInterval(() => {
      if (!this.socket || !this.socket.connected) {
        return;
      }

      const now = Date.now();
      this.rooms.forEach((room, key) => {
        const inactivity = now - room.lastEventAt;
        const threshold =
          room.type === 'auction' ? this.RESYNC_INACTIVITY_THRESHOLD_AUCTION : this.RESYNC_INACTIVITY_THRESHOLD;
        if (inactivity > threshold) {
          // No events for too long - trigger resync
          if (room.type === 'lobby') {
            this.syncLobby();
          } else if (room.type === 'auction' && room.auctionId) {
            this.syncAuction(room.auctionId, room.lastSeq);
          }
        }
      });
    }, this.RESYNC_CHECK_INTERVAL);
  }

  private stopResyncCheck(): void {
    if (this.resyncTimer !== null) {
      window.clearInterval(this.resyncTimer);
      this.resyncTimer = null;
    }
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();
