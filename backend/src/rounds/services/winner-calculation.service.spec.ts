import { WinnerCalculationService } from './winner-calculation.service';
import { BidData } from './winner-calculation.service';
import { IAuction } from '../../common/types/entities.types';

describe('WinnerCalculationService', () => {
  let service: WinnerCalculationService;

  beforeEach(() => {
    service = new WinnerCalculationService();
  });

  describe('calculateRoundCompletion', () => {
    const createAuction = (overrides: Partial<IAuction> = {}): IAuction => ({
      _id: 'auction-1',
      title: 'Test Auction',
      description: 'Test',
      status: 'active',
      totalRounds: 5,
      currentRound: 1,
      winnersPerRound: 3,
      roundDuration: 60,
      minBid: 100,
      minIncrement: 10,
      antiSnipingWindow: 30,
      antiSnipingExtension: 30,
      maxRoundExtensions: 1,
      totalGiftsDistributed: 0,
      createdAt: new Date(),
      startedAt: new Date(),
      endedAt: null,
      ...overrides,
    });

    const createBid = (
      id: string,
      userId: string,
      amount: number,
      timestamp: Date = new Date(),
      recipientUserId?: string,
    ): BidData => ({
      _id: id,
      userId,
      amount,
      timestamp,
      recipientUserId: recipientUserId || userId,
    });

    it('should calculate winners correctly for first round', () => {
      const auction = createAuction({ totalRounds: 5, winnersPerRound: 3, totalGiftsDistributed: 0 });
      const bids: BidData[] = [
        createBid('bid-1', 'user-1', 1000),
        createBid('bid-2', 'user-2', 900),
        createBid('bid-3', 'user-3', 800),
        createBid('bid-4', 'user-2', 700),
        createBid('bid-5', 'user-4', 600),
      ];

      const result = service.calculateRoundCompletion(bids, auction, 1, 3);

      expect(result.winners).toHaveLength(3);
      expect(result.winners[0]?.bidId).toBe('bid-1');
      expect(result.winners[0]?.giftNumber).toBe(1);
      expect(result.winners[1]?.bidId).toBe('bid-2');
      expect(result.winners[1]?.giftNumber).toBe(2);
      expect(result.winners[2]?.bidId).toBe('bid-3');
      expect(result.winners[2]?.giftNumber).toBe(3);
      expect(result.totalGiftsAfterRound).toBe(3);
      expect(result.isAuctionComplete).toBe(false);
    });

    it('should refund displaced losers based on remaining supply AFTER burning gifts this round', () => {
      const auction = createAuction({ totalRounds: 3, winnersPerRound: 2, totalGiftsDistributed: 0 });
      
      const bids: BidData[] = Array.from({ length: 10 }, (_, i) => createBid(`bid-${i + 1}`, `user-${i + 1}`, 1000 - i * 10));

      const result = service.calculateRoundCompletion(bids, auction, 1, 2);

      expect(result.winners).toHaveLength(2);
      expect(result.totalGiftsAfterRound).toBe(2);
      // After winners removed: 8 active remain; keep top4, refund bottom4
      expect(result.losersToRefundNow).toHaveLength(4);
      expect(result.isAuctionComplete).toBe(false);
    });

    it('should refund all losers if auction is complete', () => {
      const auction = createAuction({
        totalRounds: 2,
        winnersPerRound: 3,
        totalGiftsDistributed: 3, // Already distributed 3 gifts
      });
      const bids: BidData[] = [
        createBid('bid-1', 'user-1', 1000),
        createBid('bid-2', 'user-2', 900),
        createBid('bid-3', 'user-3', 800),
        createBid('bid-4', 'user-4', 700),
        createBid('bid-5', 'user-5', 600),
      ];

      // Round 2 (last round)
      const result = service.calculateRoundCompletion(bids, auction, 2, 3);

      expect(result.winners).toHaveLength(3);
      expect(result.losersToRefundNow).toHaveLength(2); // bid-4, bid-5
      expect(result.isAuctionComplete).toBe(true);
    });

    it('should handle supply exhaustion correctly', () => {
      const auction = createAuction({
        totalRounds: 5,
        winnersPerRound: 3,
        totalGiftsDistributed: 14, // Almost exhausted (15 total)
      });
      const bids: BidData[] = [
        createBid('bid-1', 'user-1', 1000), // Winner (gift 15)
        createBid('bid-2', 'user-2', 900), // Should be refunded (supply exhausted)
        createBid('bid-3', 'user-3', 800), // Should be refunded
      ];

      const result = service.calculateRoundCompletion(bids, auction, 5, 3);

      expect(result.winners).toHaveLength(1);
      expect(result.winners[0]?.giftNumber).toBe(15);
      expect(result.losersToRefundNow).toHaveLength(2);
      expect(result.isAuctionComplete).toBe(true);
    });

    it('should burn gifts even if bids are fewer than winnersCountThisRound (gaps)', () => {
      const auction = createAuction({ totalRounds: 10, winnersPerRound: 10, totalGiftsDistributed: 0 });
      const bids: BidData[] = [
        createBid('bid-1', 'user-1', 1000),
        createBid('bid-2', 'user-2', 900),
      ];

      const result = service.calculateRoundCompletion(bids, auction, 1, 10);

      expect(result.winners).toHaveLength(2); // Only 2 bids
      expect(result.losersToRefundNow).toHaveLength(0);
      expect(result.totalGiftsAfterRound).toBe(10); // burned 10 (8 unassigned)
    });

    it('should handle empty bids array', () => {
      const auction = createAuction({ totalRounds: 5, winnersPerRound: 3, totalGiftsDistributed: 0 });
      const bids: BidData[] = [];

      const result = service.calculateRoundCompletion(bids, auction, 1, 3);

      expect(result.winners).toHaveLength(0);
      expect(result.losersToRefundNow).toHaveLength(0);
      expect(result.totalGiftsAfterRound).toBe(3); // burned 3 even with zero bids
      expect(result.isAuctionComplete).toBe(false);
    });

    it('should assign correct gift numbers based on totalGiftsDistributed', () => {
      const auction = createAuction({ totalRounds: 5, winnersPerRound: 3, totalGiftsDistributed: 6 });
      const bids: BidData[] = [
        createBid('bid-1', 'user-1', 1000),
        createBid('bid-2', 'user-2', 900),
        createBid('bid-3', 'user-3', 800),
      ];

      const result = service.calculateRoundCompletion(bids, auction, 3, 3);

      expect(result.winners[0]?.giftNumber).toBe(7); // 6 + 1
      expect(result.winners[1]?.giftNumber).toBe(8); // 6 + 2
      expect(result.winners[2]?.giftNumber).toBe(9); // 6 + 3
    });

    it('should respect recipientUserId in winners', () => {
      const auction = createAuction({ totalRounds: 5, winnersPerRound: 3, totalGiftsDistributed: 0 });
      const bids: BidData[] = [
        createBid('bid-1', 'user-1', 1000, new Date(), 'recipient-1'),
        createBid('bid-2', 'user-2', 900, new Date(), 'recipient-2'),
        createBid('bid-3', 'user-3', 800),
      ];

      const result = service.calculateRoundCompletion(bids, auction, 1, 3);

      expect(result.winners[0]?.userId).toBe('user-1');
      expect(result.winners[0]?.recipientUserId).toBe('recipient-1');
      expect(result.winners[1]?.userId).toBe('user-2');
      expect(result.winners[1]?.recipientUserId).toBe('recipient-2');
      expect(result.winners[2]?.userId).toBe('user-3');
      expect(result.winners[2]?.recipientUserId).toBe('user-3'); // Default to userId
    });

    it('should mark auction as complete when totalGiftsAfterRound >= totalSupply', () => {
      const auction = createAuction({
        totalRounds: 2,
        winnersPerRound: 3,
        totalGiftsDistributed: 3, // 3 already distributed
      });
      // Total supply = 2 * 3 = 6
      // After this round: 3 + 3 = 6 >= 6, so complete
      const bids: BidData[] = [
        createBid('bid-1', 'user-1', 1000),
        createBid('bid-2', 'user-2', 900),
        createBid('bid-3', 'user-3', 800),
      ];

      const result = service.calculateRoundCompletion(bids, auction, 2, 3);

      expect(result.isAuctionComplete).toBe(true);
      expect(result.totalGiftsAfterRound).toBe(6);
    });

    it('should mark auction as complete on last round', () => {
      const auction = createAuction({ totalRounds: 3, winnersPerRound: 2, totalGiftsDistributed: 4 });
      const bids: BidData[] = [
        createBid('bid-1', 'user-1', 1000),
        createBid('bid-2', 'user-2', 900),
      ];

      const result = service.calculateRoundCompletion(bids, auction, 3, 2); // Last round

      expect(result.isAuctionComplete).toBe(true);
    });
  });
});
