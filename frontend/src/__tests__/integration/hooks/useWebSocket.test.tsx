

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { wsManager } from '../../../services/ws-manager';
import { createTestApiClient, createTestUser, loginAsAdmin, createTestAuction } from '../helpers/test-api.helper';
import { TEST_CONFIG, checkBackendAvailable } from '../helpers/test-config.helper';


jest.mock('../../../services/ws-manager', () => ({
  wsManager: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    setHandlers: jest.fn(),
    joinLobby: jest.fn(),
    leaveLobby: jest.fn(),
    joinAuction: jest.fn(),
    leaveAuction: jest.fn(),
    syncLobby: jest.fn(),
    syncAuction: jest.fn(),
    isConnected: jest.fn(() => false),
    getSocket: jest.fn(() => null),
  },
}));

describe('useWebSocket Hook', () => {
  let isBackendAvailable = false;

  beforeAll(async () => {
    isBackendAvailable = await checkBackendAvailable();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Auto-join Lobby', () => {
    it('should auto-join lobby when autoJoinLobby is true', () => {
      const { unmount } = renderHook(() =>
        useWebSocket({
          autoJoinLobby: true,
        }),
      );

      expect(wsManager.connect).toHaveBeenCalled();
      expect(wsManager.joinLobby).toHaveBeenCalled();

      unmount();
      expect(wsManager.leaveLobby).toHaveBeenCalled();
    });

    it('should not join lobby when autoJoinLobby is false', () => {
      renderHook(() =>
        useWebSocket({
          autoJoinLobby: false,
        }),
      );

      expect(wsManager.joinLobby).not.toHaveBeenCalled();
    });
  });

  describe('Auto-join Auction', () => {
    it('should auto-join auction when auctionId is provided', () => {
      const auctionId = 'test-auction-123';
      const { unmount } = renderHook(() =>
        useWebSocket({
          auctionId,
        }),
      );

      expect(wsManager.connect).toHaveBeenCalled();
      
      expect(wsManager.joinAuction).toHaveBeenCalledWith(auctionId, { wantSnapshot: true });

      unmount();
      expect(wsManager.leaveAuction).toHaveBeenCalledWith(auctionId);
    });

    it('should pass auction options to joinAuction', () => {
      const auctionId = 'test-auction-123';
      renderHook(() =>
        useWebSocket({
          auctionId,
          auctionOptions: { wantSnapshot: false, lastSeq: 5 },
        }),
      );

      expect(wsManager.joinAuction).toHaveBeenCalledWith(auctionId, { wantSnapshot: false, lastSeq: 5 });
    });
  });

  describe('Event Handlers', () => {
    it('should set handlers on mount', () => {
      const handlers = {
        onAuctionCreated: jest.fn(),
        onAuctionSnapshot: jest.fn(),
        onBidPlaced: jest.fn(),
      };

      renderHook(() => useWebSocket(handlers));

      expect(wsManager.setHandlers).toHaveBeenCalled();
      const setHandlersCall = (wsManager.setHandlers as jest.Mock).mock.calls[0][0];
      expect(setHandlersCall.onAuctionCreated).toBeDefined();
      expect(setHandlersCall.onAuctionSnapshot).toBeDefined();
      expect(setHandlersCall.onBidPlaced).toBeDefined();
    });

    it('should update handlers when options change', () => {
      const handlers1 = { onAuctionCreated: jest.fn() };
      const handlers2 = { onAuctionSnapshot: jest.fn() };

      const { rerender } = renderHook((props) => useWebSocket(props), {
        initialProps: handlers1,
      });

      expect(wsManager.setHandlers).toHaveBeenCalledTimes(1);

      rerender(handlers2);
      expect(wsManager.setHandlers).toHaveBeenCalledTimes(2);
    });
  });

  describe('Manual Room Control', () => {
    it('should provide joinLobby and leaveLobby functions', () => {
      const { result } = renderHook(() => useWebSocket());

      expect(result.current.joinLobby).toBeDefined();
      expect(result.current.leaveLobby).toBeDefined();

      result.current.joinLobby();
      expect(wsManager.joinLobby).toHaveBeenCalled();

      result.current.leaveLobby();
      expect(wsManager.leaveLobby).toHaveBeenCalled();
    });

    it('should provide joinAuction and leaveAuction functions', () => {
      const { result } = renderHook(() => useWebSocket());
      const auctionId = 'test-auction-123';

      expect(result.current.joinAuction).toBeDefined();
      expect(result.current.leaveAuction).toBeDefined();

      result.current.joinAuction(auctionId);
      expect(wsManager.joinAuction).toHaveBeenCalledWith(auctionId, undefined);

      result.current.leaveAuction(auctionId);
      expect(wsManager.leaveAuction).toHaveBeenCalledWith(auctionId);
    });

    it('should provide syncLobby and syncAuction functions', () => {
      const { result } = renderHook(() => useWebSocket());
      const auctionId = 'test-auction-123';

      expect(result.current.syncLobby).toBeDefined();
      expect(result.current.syncAuction).toBeDefined();

      result.current.syncLobby({ page: 1, limit: 10 });
      expect(wsManager.syncLobby).toHaveBeenCalledWith({ page: 1, limit: 10 });

      result.current.syncAuction(auctionId, 5);
      expect(wsManager.syncAuction).toHaveBeenCalledWith(auctionId, 5);
    });
  });
});
