

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { wsManager } from '../services/ws-manager';
import type { WSEventHandlers } from '../services/ws-manager';

export interface UseWebSocketOptions extends WSEventHandlers {
  
  autoJoinLobby?: boolean;

  
  auctionId?: string;

  
  auctionOptions?: { wantSnapshot?: boolean; lastSeq?: number };
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const optionsRef = useRef<UseWebSocketOptions>({});

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  
  useEffect(() => {
    wsManager.setHandlers({
      onAuctionCreated: (payload) => optionsRef.current.onAuctionCreated?.(payload),
      onLobbySnapshot: (payload) => optionsRef.current.onLobbySnapshot?.(payload),
      onAuctionSnapshot: (payload) => optionsRef.current.onAuctionSnapshot?.(payload),
      onAuctionPatch: (payload) => optionsRef.current.onAuctionPatch?.(payload),
      onBidPlaced: (payload) => optionsRef.current.onBidPlaced?.(payload),
      onRoundStarted: (payload) => optionsRef.current.onRoundStarted?.(payload),
      onRoundExtended: (payload) => optionsRef.current.onRoundExtended?.(payload),
      onRoundEnded: (payload) => optionsRef.current.onRoundEnded?.(payload),
      onAuctionUpdated: (payload) => optionsRef.current.onAuctionUpdated?.(payload),
      onPong: (payload) => optionsRef.current.onPong?.(payload),
    });
  }, [options]);

  
  useEffect(() => {
    if (options.autoJoinLobby) {
      wsManager.connect();
      wsManager.joinLobby();
      return () => {
        wsManager.leaveLobby();
      };
    }
  }, [options.autoJoinLobby]);

  
  useEffect(() => {
    if (options.auctionId) {
      wsManager.connect();
      
      const auctionOpts = options.auctionOptions || { wantSnapshot: true };
      wsManager.joinAuction(options.auctionId, auctionOpts);
      return () => {
        wsManager.leaveAuction(options.auctionId!);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.auctionId, options.auctionOptions?.wantSnapshot, options.auctionOptions?.lastSeq]);

  const joinLobby = useCallback(() => {
    wsManager.connect();
    wsManager.joinLobby();
  }, []);

  const leaveLobby = useCallback(() => {
    wsManager.leaveLobby();
  }, []);

  const joinAuction = useCallback((auctionId: string, opts?: { wantSnapshot?: boolean; lastSeq?: number }) => {
    wsManager.connect();
    wsManager.joinAuction(auctionId, opts);
  }, []);

  const leaveAuction = useCallback((auctionId: string) => {
    wsManager.leaveAuction(auctionId);
  }, []);

  const syncLobby = useCallback(
    (opts?: { page?: number; limit?: number; tab?: 'active' | 'all' | 'history'; status?: string }) => {
      wsManager.syncLobby(opts);
    },
    [],
  );

  const syncAuction = useCallback((auctionId: string, lastSeq?: number) => {
    wsManager.syncAuction(auctionId, lastSeq);
  }, []);

  const isConnected = useCallback(() => wsManager.isConnected(), []);

  const getSocket = useCallback(() => wsManager.getSocket(), []);

  return useMemo(() => ({
    
    joinLobby,

    
    leaveLobby,

    
    joinAuction,

    
    leaveAuction,

    
    syncLobby,

    
    syncAuction,

    
    isConnected,

    
    getSocket,
  }), [getSocket, isConnected, joinAuction, joinLobby, leaveAuction, leaveLobby, syncAuction, syncLobby]);
};
