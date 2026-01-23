

import { auctionsService } from '../../../services/auctions.service';
import { createTestApiClient, createTestUser, loginAsAdmin, createTestAuction } from '../helpers/test-api.helper';
import { TEST_CONFIG, checkBackendAvailable } from '../helpers/test-config.helper';

describe('Auctions API Integration', () => {
  const api = createTestApiClient();
  let isBackendAvailable = false;
  let adminToken: string;
  let userToken: string;
  let testAuctionId: string;

  beforeAll(async () => {
    isBackendAvailable = await checkBackendAvailable();
    if (!isBackendAvailable) {
      console.warn('Backend not available, skipping integration tests');
      return;
    }

    adminToken = await loginAsAdmin(api);
    const user = await createTestUser(api);
    userToken = user.token;
  });

  beforeEach(async () => {
    if (!isBackendAvailable) return;

    
    testAuctionId = await createTestAuction(api, adminToken);
  });

  describe('List Auctions', () => {
    it('should fetch auctions list', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const result = await auctionsService.getAll(undefined, 1, 20);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should filter auctions by status', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const draftAuctions = await auctionsService.getAll('draft', 1, 20);
      const activeAuctions = await auctionsService.getAll('active', 1, 20);

      expect(draftAuctions.data.every((a) => a.status === 'draft')).toBe(true);
      expect(activeAuctions.data.every((a) => a.status === 'active')).toBe(true);
    });

    it('should support pagination', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const page1 = await auctionsService.getAll(undefined, 1, 2);
      const page2 = await auctionsService.getAll(undefined, 2, 2);

      expect(page1.page).toBe(1);
      expect(page2.page).toBe(2);
      expect(page1.data.length).toBeLessThanOrEqual(2);
      expect(page2.data.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Get Auction', () => {
    it('should fetch auction by ID', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const auction = await auctionsService.getById(testAuctionId);

      expect(auction).toHaveProperty('_id');
      expect(auction._id).toBe(testAuctionId);
      expect(auction).toHaveProperty('title');
      expect(auction).toHaveProperty('status');
      expect(auction.status).toBe('draft');
    });

    it('should throw error for non-existent auction', async () => {
      if (!isBackendAvailable) {
        return;
      }

      await expect(auctionsService.getById('nonexistent123')).rejects.toThrow();
    });
  });

  describe('Create Auction', () => {
    it('should create auction (admin only)', async () => {
      if (!isBackendAvailable) {
        return;
      }

      localStorage.setItem('accessToken', adminToken);

      const auctionData = {
        title: `Integration Test Auction ${Date.now()}`,
        description: 'Test auction',
        totalRounds: 3,
        winnersPerRound: 2,
        roundDuration: 60,
        minBid: 100,
        minIncrement: 10,
      };

      const auction = await auctionsService.create(auctionData);

      expect(auction).toHaveProperty('_id');
      expect(auction.title).toBe(auctionData.title);
      expect(auction.status).toBe('draft');
      expect(auction.totalRounds).toBe(auctionData.totalRounds);
    });
  });

  describe('Start Auction', () => {
    it('should start auction (admin only)', async () => {
      if (!isBackendAvailable) {
        return;
      }

      localStorage.setItem('accessToken', adminToken);
      await auctionsService.start(testAuctionId);

      const auction = await auctionsService.getById(testAuctionId);
      expect(auction.status).toBe('active');
      expect(auction.currentRound).toBeGreaterThan(0);
    });
  });

  describe('Get Current Round', () => {
    it('should get current round for active auction', async () => {
      if (!isBackendAvailable) {
        return;
      }

      localStorage.setItem('accessToken', adminToken);
      await auctionsService.start(testAuctionId);

      const round = await auctionsService.getCurrentRound(testAuctionId);

      expect(round).toHaveProperty('_id');
      expect(round).toHaveProperty('roundNumber');
      expect(round).toHaveProperty('status');
      expect(round?.status).toBe('active');
    });

    it('should return null for draft auction', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const round = await auctionsService.getCurrentRound(testAuctionId);

      expect(round).toBeNull();
    });
  });
});
