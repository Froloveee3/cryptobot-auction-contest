

import { io, Socket } from 'socket.io-client';
import { TEST_CONFIG, checkBackendAvailable } from '../helpers/test-config.helper';
import { createTestApiClient, createTestUser, loginAsAdmin, createTestAuction, waitFor } from '../helpers/test-api.helper';

describe('WebSocket Integration', () => {
  let isBackendAvailable = false;
  let wsUrl: string;
  let adminToken: string;
  let userToken: string;
  let testAuctionId: string;

  
  jest.setTimeout(30000);

  beforeAll(async () => {
    isBackendAvailable = await checkBackendAvailable();
    if (!isBackendAvailable) {
      console.warn('Backend not available, skipping WebSocket tests');
      return;
    }

    wsUrl = TEST_CONFIG.WS_URL;
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

  describe('Connection', () => {
    it('should connect to WebSocket namespace', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      const socket: Socket = io(`${wsUrl}/auctions`, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
      });

      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        socket.disconnect();
        done();
      });

      socket.on('connect_error', (error) => {
        socket.disconnect();
        done(error);
      });
    });
  });

  describe('Lobby Events', () => {
    it('should join lobby and receive auction:created event', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      const socket: Socket = io(`${wsUrl}/auctions`, {
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        socket.emit('join:lobby');

        // Create a new auction (should trigger auction:created)
        const api = createTestApiClient();
        createTestAuction(api, adminToken)
          .then((newAuctionId) => {
            socket.on('auction:created', (payload) => {
              expect(payload).toHaveProperty('_id');
              expect(payload._id).toBe(newAuctionId);
              socket.emit('leave:lobby');
              socket.disconnect();
              done();
            });
          })
          .catch((error) => {
            socket.disconnect();
            done(error);
          });
      });

      socket.on('connect_error', (error) => {
        socket.disconnect();
        done(error);
      });
    });

    it('should receive lobby:snapshot on sync:lobby', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      const socket: Socket = io(`${wsUrl}/auctions`, {
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        socket.emit('sync:lobby', { page: 1, limit: 10 });

        socket.on('lobby:snapshot', (payload) => {
          expect(payload).toHaveProperty('data');
          expect(payload).toHaveProperty('page');
          expect(payload).toHaveProperty('serverTime');
          expect(Array.isArray(payload.data)).toBe(true);
          socket.disconnect();
          done();
        });
      });

      socket.on('connect_error', (error) => {
        socket.disconnect();
        done(error);
      });
    });
  });

  describe('Auction Events', () => {
    it('should join auction and receive snapshot', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      const socket: Socket = io(`${wsUrl}/auctions`, {
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        socket.emit('join:auction', {
          auctionId: testAuctionId,
          token: userToken,
          wantSnapshot: true,
        });

        socket.on('auction:snapshot', (payload) => {
          expect(payload).toHaveProperty('auctionId');
          expect(payload.auctionId).toBe(testAuctionId);
          expect(payload).toHaveProperty('seq');
          expect(payload).toHaveProperty('top100');
          expect(payload).toHaveProperty('currentRound');
          expect(payload).toHaveProperty('me');
          socket.disconnect();
          done();
        });
      });

      socket.on('connect_error', (error) => {
        socket.disconnect();
        done(error);
      });
    });

    it('should receive bid:placed event', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      const socket: Socket = io(`${wsUrl}/auctions`, {
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        socket.emit('join:auction', {
          auctionId: testAuctionId,
          token: userToken,
        });

        // Wait for snapshot, then place bid
        socket.once('auction:snapshot', () => {
          // Place bid via HTTP
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
            .then(() => {
              socket.on('bid:placed', (payload) => {
                expect(payload).toHaveProperty('_id');
                expect(payload).toHaveProperty('auctionId');
                expect(payload.auctionId).toBe(testAuctionId);
                socket.disconnect();
                done();
              });
            })
            .catch((error) => {
              socket.disconnect();
              done(error);
            });
        });
      });

      socket.on('connect_error', (error) => {
        socket.disconnect();
        done(error);
      });
    });

    it('should receive round:started event', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      // Create a new auction and start it
      const api = createTestApiClient();
      createTestAuction(api, adminToken).then((newAuctionId) => {
        const socket: Socket = io(`${wsUrl}/auctions`, {
          transports: ['websocket', 'polling'],
        });

      socket.on('connect', () => {
        socket.emit('join:auction', {
          auctionId: newAuctionId,
          token: userToken,
        });

        socket.on('round:started', (payload) => {
          expect(payload).toHaveProperty('roundId');
          expect(payload).toHaveProperty('roundNumber');
          expect(payload.roundNumber).toBe(1);
          socket.disconnect();
          done();
        });

        // Start auction (triggers round:started)
        api
          .post(
            `/auctions/${newAuctionId}/start`,
            {},
            {
              headers: { Authorization: `Bearer ${adminToken}` },
            },
          )
          .catch((error) => {
            socket.disconnect();
            done(error);
          });
      });

      socket.on('connect_error', (error) => {
        socket.disconnect();
        done(error);
      });
      });
    });
  });

  describe('Heartbeat', () => {
    it('should respond to app:ping with app:pong', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      const socket: Socket = io(`${wsUrl}/auctions`, {
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        socket.on('app:pong', (payload) => {
          expect(payload).toHaveProperty('serverTime');
          expect(typeof payload.serverTime).toBe('number');
          socket.disconnect();
          done();
        });

        socket.emit('app:ping');
      });

      socket.on('connect_error', (error) => {
        socket.disconnect();
        done(error);
      });
    });
  });
});
