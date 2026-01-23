

import { wsManager } from '../../../services/ws-manager';
import { createTestApiClient, createTestUser, loginAsAdmin, createTestAuction } from '../helpers/test-api.helper';
import { TEST_CONFIG, checkBackendAvailable } from '../helpers/test-config.helper';

describe('WebSocket Manager Integration', () => {
  let isBackendAvailable = false;
  let adminToken: string;
  let userToken: string;
  let testAuctionId: string;

  beforeAll(async () => {
    isBackendAvailable = await checkBackendAvailable();
    if (!isBackendAvailable) {
      console.warn('Backend not available, skipping WS manager tests');
      return;
    }

    const api = createTestApiClient();
    adminToken = await loginAsAdmin(api);
    const user = await createTestUser(api);
    userToken = user.token;

    
    testAuctionId = await createTestAuction(api, adminToken);
    await api.post(
      `/auctions/${testAuctionId}/start`,
      {},
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
  });

  beforeEach(() => {
    // Clean up before each test
    wsManager.disconnect();
    wsManager.setAuth(null, null);
    wsManager.setHandlers({});
  });

  afterEach(() => {
    wsManager.disconnect();
  });

  describe('Connection Management', () => {
    it('should connect and disconnect', () => {
      if (!isBackendAvailable) {
        return;
      }

      expect(wsManager.isConnected()).toBe(false);

      wsManager.connect();
      expect(wsManager.isConnected()).toBe(true);

      wsManager.disconnect();
      expect(wsManager.isConnected()).toBe(false);
    });

    it('should return same socket instance on multiple connect calls', () => {
      if (!isBackendAvailable) {
        return;
      }

      const socket1 = wsManager.connect();
      const socket2 = wsManager.connect();

      expect(socket1).toBe(socket2);
    });
  });

  describe('Authentication', () => {
    it('should set and use JWT token for join:auction', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.setAuth(userToken, null);
      wsManager.connect();

      const snapshotReceived = jest.fn();
      wsManager.setHandlers({
        onAuctionSnapshot: (snapshot) => {
          expect(snapshot.auctionId).toBe(testAuctionId);
          expect(snapshot.me).toBeDefined();
          expect(snapshot.me?.userId).toBeDefined();
          snapshotReceived();
          wsManager.disconnect();
          done();
        },
      });

      wsManager.joinAuction(testAuctionId, { wantSnapshot: true });
    });

    it('should set and use Telegram initData for join:auction', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      const initData =
        'query_id=AAH0acQOAAAAAPRpxA5iUcVk&user=%7B%22id%22%3A247753204%2C%22first_name%22%3A%22Vadim%22%2C%22last_name%22%3A%22Frolov%22%2C%22username%22%3A%22Froloweeeb3%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FF6fvfO7F84k59zhlJWu_vWtS-EEiw6U8n9lilaBKWn0.svg%22%7D&auth_date=1769083885&signature=QN9euBJG4EpSXOYnbgohZWAmmKPmfNEcPSNe4dbPWFE23oY2LlJUxqaVjdoW4V-xjzfelcj-zwoOR6nKAuRiAg&hash=0118d18a8dcf2d6f437c307ed95cfb1a31c34a9f79ee13a5f65484514db61736';

      wsManager.setAuth(null, initData);
      wsManager.connect();

      const snapshotReceived = jest.fn();
      wsManager.setHandlers({
        onAuctionSnapshot: (snapshot) => {
          expect(snapshot.auctionId).toBe(testAuctionId);
          snapshotReceived();
          wsManager.disconnect();
          done();
        },
      });

      wsManager.joinAuction(testAuctionId, { wantSnapshot: true });
    });
  });

  describe('Room Management', () => {
    it('should join and leave lobby', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.connect();
      wsManager.joinLobby();

      wsManager.setHandlers({
        onAuctionCreated: () => {
          wsManager.leaveLobby();
          wsManager.disconnect();
          done();
        },
      });

      // Create auction to trigger auction:created
      const api = createTestApiClient();
      createTestAuction(api, adminToken);
    });

    it('should join and leave auction', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.setAuth(userToken, null);
      wsManager.connect();

      wsManager.setHandlers({
        onAuctionSnapshot: (snapshot) => {
          expect(snapshot.auctionId).toBe(testAuctionId);
          wsManager.leaveAuction(testAuctionId);
          wsManager.disconnect();
          done();
        },
      });

      wsManager.joinAuction(testAuctionId, { wantSnapshot: true });
    });

    it('should handle multiple auction rooms', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      const api = createTestApiClient();
      createTestAuction(api, adminToken).then((auctionId2) => {
        wsManager.setAuth(userToken, null);
        wsManager.connect();

        let snapshotsReceived = 0;
        wsManager.setHandlers({
          onAuctionSnapshot: (snapshot) => {
            snapshotsReceived++;
            if (snapshotsReceived === 2) {
              wsManager.leaveAuction(testAuctionId);
              wsManager.leaveAuction(auctionId2);
              wsManager.disconnect();
              done();
            }
          },
        });

        wsManager.joinAuction(testAuctionId, { wantSnapshot: true });
        wsManager.joinAuction(auctionId2, { wantSnapshot: true });
      });
    });
  });

  describe('Snapshot and Patch', () => {
    it('should receive auction snapshot with all fields', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.setAuth(userToken, null);
      wsManager.connect();

      wsManager.setHandlers({
        onAuctionSnapshot: (snapshot) => {
          expect(snapshot).toHaveProperty('auctionId');
          expect(snapshot).toHaveProperty('seq');
          expect(snapshot).toHaveProperty('serverTime');
          expect(snapshot).toHaveProperty('currentRound');
          expect(snapshot).toHaveProperty('top100');
          expect(snapshot).toHaveProperty('remainingSupply');
          expect(snapshot).toHaveProperty('dynamicMinBid');
          expect(snapshot).toHaveProperty('minBid');
          expect(snapshot).toHaveProperty('minIncrement');
          expect(Array.isArray(snapshot.top100)).toBe(true);
          expect(snapshot.top100.length).toBeLessThanOrEqual(100);
          wsManager.disconnect();
          done();
        },
      });

      wsManager.joinAuction(testAuctionId, { wantSnapshot: true });
    });

    it('should receive auction patch after placing bid', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.setAuth(userToken, null);
      wsManager.connect();

      let snapshotReceived = false;
      wsManager.setHandlers({
        onAuctionSnapshot: () => {
          snapshotReceived = true;
          // Place bid after snapshot
          const api = createTestApiClient();
          localStorage.setItem('accessToken', userToken);
          api
            .post(
              `/auctions/${testAuctionId}/bids`,
              { amount: 500, mode: 'new' },
              {
                headers: { Authorization: `Bearer ${userToken}` },
              },
            )
            .catch(() => {
              // Ignore errors
            });
        },
        onAuctionPatch: (patch) => {
          if (snapshotReceived) {
            expect(patch.auctionId).toBe(testAuctionId);
            expect(patch).toHaveProperty('seq');
            wsManager.disconnect();
            done();
          }
        },
      });

      wsManager.joinAuction(testAuctionId, { wantSnapshot: true });
    });
  });

  describe('Resync', () => {
    it('should sync lobby on request', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.connect();
      wsManager.joinLobby();

      wsManager.setHandlers({
        onLobbySnapshot: (snapshot) => {
          expect(snapshot).toHaveProperty('data');
          expect(snapshot).toHaveProperty('page');
          expect(snapshot).toHaveProperty('serverTime');
          expect(Array.isArray(snapshot.data)).toBe(true);
          wsManager.disconnect();
          done();
        },
      });

      wsManager.syncLobby({ page: 1, limit: 10 });
    });

    it('should sync auction on request', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.setAuth(userToken, null);
      wsManager.connect();
      wsManager.joinAuction(testAuctionId);

      wsManager.setHandlers({
        onAuctionSnapshot: (snapshot) => {
          expect(snapshot.auctionId).toBe(testAuctionId);
          wsManager.disconnect();
          done();
        },
      });

      wsManager.syncAuction(testAuctionId);
    });
  });

  describe('Reconnect and Resync', () => {
    it('should rejoin rooms on reconnect', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.setAuth(userToken, null);
      wsManager.connect();
      wsManager.joinLobby();
      wsManager.joinAuction(testAuctionId);

      let reconnected = false;
      wsManager.setHandlers({
        onAuctionSnapshot: (snapshot) => {
          if (reconnected) {
            // Received snapshot after reconnect
            expect(snapshot.auctionId).toBe(testAuctionId);
            wsManager.disconnect();
            done();
          }
        },
      });

      // Force reconnect
      const socket = wsManager.getSocket();
      if (socket) {
        socket.disconnect();
        setTimeout(() => {
          reconnected = true;
          wsManager.connect();
        }, 1000);
      } else {
        done();
      }
    });
  });

  describe('Heartbeat', () => {
    it('should respond to app:ping with app:pong', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.connect();

      wsManager.setHandlers({
        onPong: (payload) => {
          expect(payload).toHaveProperty('serverTime');
          expect(typeof payload.serverTime).toBe('number');
          wsManager.disconnect();
          done();
        },
      });

      const socket = wsManager.getSocket();
      if (socket) {
        socket.emit('app:ping');
      } else {
        done();
      }
    });
  });
});
