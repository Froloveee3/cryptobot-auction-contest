import { Test, TestingModule } from '@nestjs/testing';
import { BidStatusUpdateService, WinnerInfo, LoserInfo, BidAmountMap } from './bid-status-update.service';
import { BalanceService } from '../../balance/balance.service';
import { BidRepository } from '../../common/repositories/bid.repository';
import { ClientSession, Types } from 'mongoose';

describe('BidStatusUpdateService', () => {
  let service: BidStatusUpdateService;
  let balanceService: jest.Mocked<BalanceService>;

  const mockBalanceService = {
    charge: jest.fn(),
    refund: jest.fn(),
  };

  const mockBulkWrite = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  const mockBidRepository = {
    getModel: jest.fn().mockReturnValue({
      bulkWrite: mockBulkWrite,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BidStatusUpdateService,
        {
          provide: BalanceService,
          useValue: mockBalanceService,
        },
        {
          provide: BidRepository,
          useValue: mockBidRepository,
        },
      ],
    }).compile();

    service = module.get<BidStatusUpdateService>(BidStatusUpdateService);
    balanceService = module.get(BalanceService);

    
    jest.clearAllMocks();
    mockBulkWrite.mockClear();
  });

  describe('updateWinners', () => {
    it('should update winners status and charge balances', async () => {
      const bidId1 = new Types.ObjectId().toString();
      const bidId2 = new Types.ObjectId().toString();
      const winners: WinnerInfo[] = [
        { bidId: bidId1, giftNumber: 1, userId: 'user-1', recipientUserId: 'user-1', wonRoundNumber: 1 },
        { bidId: bidId2, giftNumber: 2, userId: 'user-2', recipientUserId: 'user-2', wonRoundNumber: 1 },
      ];
      const bidAmounts: BidAmountMap = {
        [bidId1]: 1000,
        [bidId2]: 900,
      };

      await service.updateWinners(winners, bidAmounts);

      expect(mockBulkWrite).toHaveBeenCalledTimes(1);
      expect(balanceService.charge).toHaveBeenCalledTimes(2);
      expect(balanceService.charge).toHaveBeenCalledWith('user-1', 1000, bidId1, undefined);
      expect(balanceService.charge).toHaveBeenCalledWith('user-2', 900, bidId2, undefined);
    });

    it('should handle session parameter', async () => {
      const bidId1 = new Types.ObjectId().toString();
      const winners: WinnerInfo[] = [
        { bidId: bidId1, giftNumber: 1, userId: 'user-1', recipientUserId: 'user-1', wonRoundNumber: 1 },
      ];
      const bidAmounts: BidAmountMap = { [bidId1]: 1000 };
      const mockSession = {} as ClientSession;

      await service.updateWinners(winners, bidAmounts, mockSession);

      expect(mockBulkWrite).toHaveBeenCalledWith(
        expect.any(Array),
        { session: mockSession },
      );
      expect(balanceService.charge).toHaveBeenCalledWith('user-1', 1000, bidId1, mockSession);
    });

    it('should handle empty winners array', async () => {
      await service.updateWinners([], {});

      expect(mockBulkWrite).not.toHaveBeenCalled();
      expect(balanceService.charge).not.toHaveBeenCalled();
    });

    it('should skip charge if amount is undefined', async () => {
      const bidId1 = new Types.ObjectId().toString();
      const winners: WinnerInfo[] = [
        { bidId: bidId1, giftNumber: 1, userId: 'user-1', recipientUserId: 'user-1', wonRoundNumber: 1 },
      ];
      const bidAmounts: BidAmountMap = {}; 

      await service.updateWinners(winners, bidAmounts);

      expect(mockBulkWrite).toHaveBeenCalled();
      expect(balanceService.charge).not.toHaveBeenCalled();
    });

    it('should set correct status and giftNumber in bulkWrite', async () => {
      const bidId1 = new Types.ObjectId().toString();
      const bidId2 = new Types.ObjectId().toString();
      const winners: WinnerInfo[] = [
        { bidId: bidId1, giftNumber: 5, userId: 'user-1', recipientUserId: 'user-1', wonRoundNumber: 3 },
        { bidId: bidId2, giftNumber: 6, userId: 'user-2', recipientUserId: 'user-2', wonRoundNumber: 3 },
      ];
      const bidAmounts: BidAmountMap = {
        [bidId1]: 1000,
        [bidId2]: 900,
      };

      await service.updateWinners(winners, bidAmounts);

      const bulkWriteCall = mockBulkWrite.mock.calls[0][0];
      expect(bulkWriteCall).toHaveLength(2);
      expect(bulkWriteCall[0].updateOne.update.$set).toEqual({
        status: 'won',
        giftNumber: 5,
        wonRoundNumber: 3,
      });
      expect(bulkWriteCall[1].updateOne.update.$set).toEqual({
        status: 'won',
        giftNumber: 6,
        wonRoundNumber: 3,
      });
    });
  });

  describe('refundLosers', () => {
    it('should refund losers and update status', async () => {
      const bidId5 = new Types.ObjectId().toString();
      const bidId6 = new Types.ObjectId().toString();
      const losers: LoserInfo[] = [
        { bidId: bidId5, userId: 'user-5' },
        { bidId: bidId6, userId: 'user-6' },
      ];
      const bidAmounts: BidAmountMap = {
        [bidId5]: 600,
        [bidId6]: 500,
      };

      await service.refundLosers(losers, bidAmounts);

      expect(mockBulkWrite).toHaveBeenCalledTimes(1);
      expect(balanceService.refund).toHaveBeenCalledTimes(2);
      expect(balanceService.refund).toHaveBeenCalledWith('user-5', 600, bidId5, undefined);
      expect(balanceService.refund).toHaveBeenCalledWith('user-6', 500, bidId6, undefined);
    });

    it('should handle session parameter', async () => {
      const bidId5 = new Types.ObjectId().toString();
      const losers: LoserInfo[] = [{ bidId: bidId5, userId: 'user-5' }];
      const bidAmounts: BidAmountMap = { [bidId5]: 600 };
      const mockSession = {} as ClientSession;

      await service.refundLosers(losers, bidAmounts, mockSession);

      expect(mockBulkWrite).toHaveBeenCalledWith(
        expect.any(Array),
        { session: mockSession },
      );
      expect(balanceService.refund).toHaveBeenCalledWith('user-5', 600, bidId5, mockSession);
    });

    it('should set status to refunded in bulkWrite', async () => {
      const bidId5 = new Types.ObjectId().toString();
      const losers: LoserInfo[] = [{ bidId: bidId5, userId: 'user-5' }];
      const bidAmounts: BidAmountMap = { [bidId5]: 600 };

      await service.refundLosers(losers, bidAmounts);

      const bulkWriteCall = mockBulkWrite.mock.calls[0][0];
      expect(bulkWriteCall[0].updateOne.update.$set).toEqual({
        status: 'refunded',
      });
    });

    it('should filter out losers without bidAmounts', async () => {
      const bidId5 = new Types.ObjectId().toString();
      const bidId6 = new Types.ObjectId().toString();
      const losers: LoserInfo[] = [
        { bidId: bidId5, userId: 'user-5' },
        { bidId: bidId6, userId: 'user-6' },
      ];
      const bidAmounts: BidAmountMap = {
        [bidId5]: 600,
        
      };

      await service.refundLosers(losers, bidAmounts);

      const bulkWriteCall = mockBulkWrite.mock.calls[0][0];
      expect(bulkWriteCall).toHaveLength(1); 
      expect(balanceService.refund).toHaveBeenCalledTimes(1);
    });

    it('should handle empty losers array', async () => {
      await service.refundLosers([], {});

      expect(mockBulkWrite).not.toHaveBeenCalled();
      expect(balanceService.refund).not.toHaveBeenCalled();
    });
  });
});
