

import {
  normalizeAuctionCreated,
  normalizeSnapshotRound,
  normalizePatchRound,
  normalizeBidPlaced,
  normalizeRoundStarted,
  normalizeRoundExtended,
  AuctionCreatedPayload,
  AuctionSnapshotPayload,
  AuctionPatchPayload,
  BidPlacedPayload,
  RoundStartedPayload,
  RoundExtendedPayload,
} from '../../../contracts/ws';

describe('WebSocket Contract Normalization', () => {
  describe('normalizeAuctionCreated', () => {
    it('should normalize auction created payload with string dates', () => {
      const payload: AuctionCreatedPayload = {
        _id: 'auction123',
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

      const normalized = normalizeAuctionCreated(payload);

      expect(normalized._id).toBe('auction123');
      expect(normalized.createdAt).toBeInstanceOf(Date);
      expect(normalized.startedAt).toBeNull();
    });
  });

  describe('normalizeSnapshotRound', () => {
    it('should normalize snapshot round with string date', () => {
      const round: AuctionSnapshotPayload['currentRound'] = {
        roundId: 'round123',
        roundNumber: 1,
        endsAt: '2024-01-01T01:00:00.000Z',
      };

      const normalized = normalizeSnapshotRound(round);

      expect(normalized.roundId).toBe('round123');
      expect(normalized.endsAt).toBeInstanceOf(Date);
    });

    it('should handle null endsAt', () => {
      const round: AuctionSnapshotPayload['currentRound'] = {
        roundId: null,
        roundNumber: null,
        endsAt: null,
      };

      const normalized = normalizeSnapshotRound(round);

      expect(normalized.roundId).toBeNull();
      expect(normalized.roundNumber).toBeNull();
      expect(normalized.endsAt).toBeNull();
    });
  });

  describe('normalizePatchRound', () => {
    it('should normalize patch round', () => {
      const round: AuctionPatchPayload['currentRound'] = {
        roundId: 'round123',
        roundNumber: 1,
        endsAt: '2024-01-01T01:00:00.000Z',
      };

      const normalized = normalizePatchRound(round);

      expect(normalized?.roundId).toBe('round123');
      expect(normalized?.endsAt).toBeInstanceOf(Date);
    });

    it('should return undefined for undefined round', () => {
      const normalized = normalizePatchRound(undefined);
      expect(normalized).toBeUndefined();
    });
  });

  describe('normalizeBidPlaced', () => {
    it('should normalize bid placed payload', () => {
      const payload: BidPlacedPayload = {
        _id: 'bid123',
        auctionId: 'auction123',
        userId: 'user123',
        amount: 500,
        status: 'active',
        timestamp: '2024-01-01T00:00:00.000Z',
        giftNumber: null,
        wonRoundNumber: null,
        recipientUserId: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        displacedUserIds: ['user456'],
      };

      const normalized = normalizeBidPlaced(payload);

      expect(normalized._id).toBe('bid123');
      expect(normalized.timestamp).toBeInstanceOf(Date);
      expect(normalized.displacedUserIds).toEqual(['user456']);
    });
  });

  describe('normalizeRoundStarted', () => {
    it('should normalize round started payload', () => {
      const payload: RoundStartedPayload = {
        roundId: 'round123',
        roundNumber: 1,
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T01:00:00.000Z',
      };

      const normalized = normalizeRoundStarted(payload);

      expect(normalized.roundId).toBe('round123');
      expect(normalized.startTime).toBeInstanceOf(Date);
      expect(normalized.endTime).toBeInstanceOf(Date);
    });
  });

  describe('normalizeRoundExtended', () => {
    it('should normalize round extended payload', () => {
      const payload: RoundExtendedPayload = {
        auctionId: 'auction123',
        roundId: 'round123',
        roundNumber: 1,
        oldEndsAt: '2024-01-01T01:00:00.000Z',
        newEndsAt: '2024-01-01T01:30:00.000Z',
        reason: 'Anti-sniping',
        topN: 10,
      };

      const normalized = normalizeRoundExtended(payload);

      expect(normalized.roundId).toBe('round123');
      expect(normalized.oldEndsAt).toBeInstanceOf(Date);
      expect(normalized.newEndsAt).toBeInstanceOf(Date);
    });
  });
});
