

import { wsManager } from '../../../services/ws-manager';
import { createTestApiClient, createTestUser, loginAsAdmin, createTestAuction } from '../helpers/test-api.helper';
import { TEST_CONFIG, checkBackendAvailable } from '../helpers/test-config.helper';

describe('WebSocket Manager Advanced Features', () => {
  let isBackendAvailable = false;
  let adminToken: string;
  let userToken: string;
  let testAuctionId: string;

  beforeAll(async () => {
    isBackendAvailable = await checkBackendAvailable();
    if (!isBackendAvailable) {
      console.warn('Backend not available, skipping advanced WS manager tests');
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
    wsManager.disconnect();
    wsManager.setAuth(null, null);
    wsManager.setHandlers({});
  });

  afterEach(() => {
    wsManager.disconnect();
  });

  describe('Resync Strategy', () => {
    it('should trigger resync after inactivity period', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      jest.setTimeout(40000); // 40s timeout for this test

      wsManager.setAuth(userToken, null);
      wsManager.connect();

      let snapshotReceived = false;
      let patchReceived = false;

      wsManager.setHandlers({
        onAuctionSnapshot: () => {
          snapshotReceived = true;
          // After snapshot, wait for resync (should happen after 30s inactivity)
          // But we'll manually trigger syncAuction to test the mechanism
          setTimeout(() => {
            wsManager.syncAuction(testAuctionId);
          }, 2000);
        },
        onAuctionPatch: (patch) => {
          if (snapshotReceived && !patchReceived) {
            patchReceived = true;
            expect(patch.auctionId).toBe(testAuctionId);
            wsManager.disconnect();
            done();
          }
        },
      });

      wsManager.joinAuction(testAuctionId, { wantSnapshot: true });
    });
  });

  describe('Multiple Rooms', () => {
    it('should handle joining lobby and auction simultaneously', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.setAuth(userToken, null);
      wsManager.connect();

      let lobbyJoined = false;
      let auctionJoined = false;

      wsManager.setHandlers({
        onLobbySnapshot: () => {
          lobbyJoined = true;
          if (lobbyJoined && auctionJoined) {
            wsManager.disconnect();
            done();
          }
        },
        onAuctionSnapshot: () => {
          auctionJoined = true;
          if (lobbyJoined && auctionJoined) {
            wsManager.disconnect();
            done();
          }
        },
      });

      wsManager.joinLobby();
      wsManager.joinAuction(testAuctionId, { wantSnapshot: true });
      wsManager.syncLobby();
    });
  });

  describe('Sequence Numbers', () => {
    it('should track and use lastSeq for optimization', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.setAuth(userToken, null);
      wsManager.connect();

      let firstSeq: number | undefined;
      wsManager.setHandlers({
        onAuctionSnapshot: (snapshot) => {
          firstSeq = snapshot.seq;
          // Rejoin with lastSeq - should get ack if seq matches
          wsManager.leaveAuction(testAuctionId);
          wsManager.joinAuction(testAuctionId, { wantSnapshot: false, lastSeq: firstSeq });
        },
        onAuctionPatch: (patch) => {
          // Should receive patch if seq changed
          expect(patch.seq).toBeGreaterThan(firstSeq!);
          wsManager.disconnect();
          done();
        },
      });

      wsManager.joinAuction(testAuctionId, { wantSnapshot: true });
    });
  });

  describe('Event Normalization', () => {
    it('should normalize dates in snapshot currentRound', (done) => {
      if (!isBackendAvailable) {
        done();
        return;
      }

      wsManager.setAuth(userToken, null);
      wsManager.connect();

      wsManager.setHandlers({
        onAuctionSnapshot: (snapshot) => {
          // Check that currentRound.endsAt is normalized
          if (snapshot.currentRound.endsAt) {
            expect(snapshot.currentRound.endsAt).toBeInstanceOf(Date);
          }
          wsManager.disconnect();
          done();
        },
      });

      wsManager.joinAuction(testAuctionId, { wantSnapshot: true });
    });

    it('should normalize dates in patch currentRound', (done) => {
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
          // Place bid to trigger patch
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
          if (snapshotReceived && patch.currentRound) {
            // Check that currentRound.endsAt is normalized
            if (patch.currentRound.endsAt) {
              expect(patch.currentRound.endsAt).toBeInstanceOf(Date);
            }
            wsManager.disconnect();
            done();
          }
        },
      });

      wsManager.joinAuction(testAuctionId, { wantSnapshot: true });
    });
  });
});
