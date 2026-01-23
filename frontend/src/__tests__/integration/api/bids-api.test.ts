

import { bidsService } from '../../../services/bids.service';
import { createTestApiClient, createTestUser, loginAsAdmin, createTestAuction } from '../helpers/test-api.helper';
import { TEST_CONFIG, checkBackendAvailable } from '../helpers/test-config.helper';

describe('Bids API Integration', () => {
  const api = createTestApiClient();
  let isBackendAvailable = false;
  let adminToken: string;
  let user1: { token: string; userId: string };
  let user2: { token: string; userId: string };
  let testAuctionId: string;

  beforeAll(async () => {
    isBackendAvailable = await checkBackendAvailable();
    if (!isBackendAvailable) {
      console.warn('Backend not available, skipping integration tests');
      return;
    }

    adminToken = await loginAsAdmin(api);
    const u1 = await createTestUser(api);
    const u2 = await createTestUser(api);
    user1 = { token: u1.token, userId: u1.userId };
    user2 = { token: u2.token, userId: u2.userId };
  });

  beforeEach(async () => {
    if (!isBackendAvailable) return;

    
    testAuctionId = await createTestAuction(api, adminToken, {
      minBid: 100,
      minIncrement: 10,
    });
    await api.post(
      `/auctions/${testAuctionId}/start`,
      {},
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );

    // Deposit funds for users
    await api.post(
      '/users/me/deposit',
      { amount: 10000 },
      {
        headers: { Authorization: `Bearer ${user1.token}` },
      },
    );
    await api.post(
      '/users/me/deposit',
      { amount: 10000 },
      {
        headers: { Authorization: `Bearer ${user2.token}` },
      },
    );
  });

  describe('Place Bid', () => {
    it('should place a new bid', async () => {
      if (!isBackendAvailable) {
        return;
      }

      // Set token in localStorage for bidsService
      localStorage.setItem('accessToken', user1.token);

      const bid = await bidsService.placeBid(testAuctionId, {
        amount: 500,
        mode: 'new',
      });

      expect(bid).toHaveProperty('_id');
      expect(bid.auctionId).toBe(testAuctionId);
      expect(bid.userId).toBe(user1.userId);
      expect(bid.amount).toBe(500);
      expect(bid.status).toBe('active');
    });

    it('should raise existing bid', async () => {
      if (!isBackendAvailable) {
        return;
      }

      localStorage.setItem('accessToken', user1.token);

      // Place initial bid
      await bidsService.placeBid(testAuctionId, {
        amount: 500,
        mode: 'new',
      });

      // Raise bid
      const raisedBid = await bidsService.placeBid(testAuctionId, {
        amount: 50, // delta
        mode: 'raise',
      });

      expect(raisedBid.amount).toBeGreaterThan(500);
    });

    it('should reject bid below minBid', async () => {
      if (!isBackendAvailable) {
        return;
      }

      localStorage.setItem('accessToken', user1.token);

      await expect(
        bidsService.placeBid(testAuctionId, {
          amount: 50, // Below minBid of 100
          mode: 'new',
        }),
      ).rejects.toThrow();
    });

    it('should handle recipientUserId', async () => {
      if (!isBackendAvailable) {
        return;
      }

      localStorage.setItem('accessToken', user1.token);

      const bid = await bidsService.placeBid(testAuctionId, {
        amount: 500,
        mode: 'new',
        recipientUserId: user2.userId,
      });

      expect(bid.recipientUserId).toBe(user2.userId);
    });
  });

  describe('Get Bids', () => {
    it('should fetch bids for auction', async () => {
      if (!isBackendAvailable) {
        return;
      }

      localStorage.setItem('accessToken', user1.token);

      // Place some bids
      await bidsService.placeBid(testAuctionId, { amount: 500, mode: 'new' });
      await bidsService.placeBid(testAuctionId, { amount: 600, mode: 'new' });

      const result = await bidsService.getByAuction(testAuctionId);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('total');
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.every((b) => b.auctionId === testAuctionId)).toBe(true);
    });

    it('should filter bids by userId', async () => {
      if (!isBackendAvailable) {
        return;
      }

      localStorage.setItem('accessToken', user1.token);
      await bidsService.placeBid(testAuctionId, { amount: 500, mode: 'new' });

      localStorage.setItem('accessToken', user2.token);
      await bidsService.placeBid(testAuctionId, { amount: 600, mode: 'new' });

      const user1Bids = await bidsService.getByAuction(testAuctionId, user1.userId);
      const user2Bids = await bidsService.getByAuction(testAuctionId, user2.userId);

      expect(user1Bids.data.every((b) => b.userId === user1.userId)).toBe(true);
      expect(user2Bids.data.every((b) => b.userId === user2.userId)).toBe(true);
    });

    it('should support pagination', async () => {
      if (!isBackendAvailable) {
        return;
      }

      localStorage.setItem('accessToken', user1.token);

      // Place multiple bids
      for (let i = 0; i < 5; i++) {
        await bidsService.placeBid(testAuctionId, {
          amount: 500 + i * 10,
          mode: 'new',
        });
      }

      const page1 = await bidsService.getByAuction(testAuctionId, undefined, 1, 2);
      const page2 = await bidsService.getByAuction(testAuctionId, undefined, 2, 2);

      expect(page1.page).toBe(1);
      expect(page2.page).toBe(2);
      expect(page1.data.length).toBeLessThanOrEqual(2);
    });
  });
});
