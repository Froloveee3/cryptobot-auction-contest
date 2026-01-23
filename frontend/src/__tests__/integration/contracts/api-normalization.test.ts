

import {
  normalizeUser,
  normalizeAuction,
  normalizeRound,
  normalizeBid,
  normalizeLeaderboardEntry,
  UserResponseDto,
  AuctionResponseDto,
  RoundResponseDto,
  BidResponseDto,
  LeaderboardEntryDto,
} from '../../../contracts/api';

describe('API Contract Normalization', () => {
  describe('normalizeUser', () => {
    it('should normalize user with string dates', () => {
      const wire: UserResponseDto = {
        id: 'user123',
        username: 'testuser',
        balance: 1000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      const normalized = normalizeUser(wire);

      expect(normalized._id).toBe('user123');
      expect(normalized.username).toBe('testuser');
      expect(normalized.balance).toBe(1000);
      expect(normalized.createdAt).toBeInstanceOf(Date);
      expect(normalized.updatedAt).toBeInstanceOf(Date);
      expect(normalized.createdAt.getTime()).toBe(new Date('2024-01-01T00:00:00.000Z').getTime());
    });

    it('should normalize user with Date objects', () => {
      const createdAt = new Date('2024-01-01T00:00:00.000Z');
      const updatedAt = new Date('2024-01-02T00:00:00.000Z');
      const wire: UserResponseDto = {
        id: 'user123',
        username: 'testuser',
        balance: 1000,
        createdAt,
        updatedAt,
      };

      const normalized = normalizeUser(wire);

      expect(normalized.createdAt).toBe(createdAt);
      expect(normalized.updatedAt).toBe(updatedAt);
    });
  });

  describe('normalizeAuction', () => {
    it('should normalize auction with all fields', () => {
      const wire: AuctionResponseDto = {
        id: 'auction123',
        title: 'Test Auction',
        description: 'Test',
        status: 'draft',
        totalRounds: 5,
        currentRound: 0,
        winnersPerRound: 2,
        roundDuration: 300,
        minBid: 100,
        minIncrement: 10,
        antiSnipingWindow: 10,
        antiSnipingExtension: 30,
        maxRoundExtensions: 3,
        totalGiftsDistributed: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        startedAt: null,
        endedAt: null,
      };

      const normalized = normalizeAuction(wire);

      expect(normalized._id).toBe('auction123');
      expect(normalized.status).toBe('draft');
      expect(normalized.createdAt).toBeInstanceOf(Date);
      expect(normalized.startedAt).toBeNull();
      expect(normalized.endedAt).toBeNull();
    });

    it('should handle null dates correctly', () => {
      const wire: AuctionResponseDto = {
        id: 'auction123',
        title: 'Test',
        description: 'Test',
        status: 'active',
        totalRounds: 5,
        currentRound: 1,
        winnersPerRound: 2,
        roundDuration: 300,
        minBid: 100,
        minIncrement: 10,
        antiSnipingWindow: 10,
        antiSnipingExtension: 30,
        maxRoundExtensions: 3,
        totalGiftsDistributed: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        startedAt: '2024-01-01T01:00:00.000Z',
        endedAt: null,
      };

      const normalized = normalizeAuction(wire);

      expect(normalized.startedAt).toBeInstanceOf(Date);
      expect(normalized.endedAt).toBeNull();
    });
  });

  describe('normalizeRound', () => {
    it('should normalize round with all fields', () => {
      const wire: RoundResponseDto = {
        id: 'round123',
        auctionId: 'auction123',
        roundNumber: 1,
        status: 'active',
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T01:00:00.000Z',
        extendedEndTime: null,
        extensionCount: 0,
        winnersCount: 0,
        participantsCount: 0,
        winners: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        completedAt: null,
      };

      const normalized = normalizeRound(wire);

      expect(normalized._id).toBe('round123');
      expect(normalized.roundNumber).toBe(1);
      expect(normalized.startTime).toBeInstanceOf(Date);
      expect(normalized.endTime).toBeInstanceOf(Date);
      expect(normalized.extendedEndTime).toBeNull();
    });
  });

  describe('normalizeBid', () => {
    it('should normalize bid with all fields', () => {
      const wire: BidResponseDto = {
        id: 'bid123',
        auctionId: 'auction123',
        userId: 'user123',
        amount: 500,
        status: 'active',
        timestamp: '2024-01-01T00:00:00.000Z',
        giftNumber: null,
        wonRoundNumber: null,
        recipientUserId: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const normalized = normalizeBid(wire);

      expect(normalized._id).toBe('bid123');
      expect(normalized.amount).toBe(500);
      expect(normalized.status).toBe('active');
      expect(normalized.timestamp).toBeInstanceOf(Date);
      expect(normalized.recipientUserId).toBeNull();
    });

    it('should handle recipientUserId', () => {
      const wire: BidResponseDto = {
        id: 'bid123',
        auctionId: 'auction123',
        userId: 'user123',
        amount: 500,
        status: 'active',
        timestamp: '2024-01-01T00:00:00.000Z',
        giftNumber: null,
        wonRoundNumber: null,
        recipientUserId: 'user456',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const normalized = normalizeBid(wire);

      expect(normalized.recipientUserId).toBe('user456');
    });
  });

  describe('normalizeLeaderboardEntry', () => {
    it('should normalize leaderboard entry', () => {
      const wire: LeaderboardEntryDto = {
        userId: 'user123',
        username: 'testuser',
        amount: 500,
        rank: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const normalized = normalizeLeaderboardEntry(wire);

      expect(normalized.userId).toBe('user123');
      expect(normalized.rank).toBe(1);
      expect(normalized.timestamp).toBeInstanceOf(Date);
    });
  });
});
