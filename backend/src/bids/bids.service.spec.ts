import { BidsService } from './bids.service';
import { RoundEndedError } from '../common/types/domain-errors.types';

describe('BidsService edge cases', () => {
  it('retries once on RoundEndedError to land bid into next active round (no premature money lock)', async () => {
    const bidRepository: any = {
      getModel: () => ({
        db: { startSession: jest.fn() },
        exists: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      }),
    };
    const roundRepository: any = { findByAuctionId: jest.fn().mockResolvedValue([]) };
    const auctionRepository: any = {};
    const balanceService: any = {};
    const usersService: any = { findByUsername: jest.fn() };
    const cacheService: any = { invalidateActiveRound: jest.fn(), get: jest.fn(), set: jest.fn() };
    const eventBus: any = { publish: jest.fn() };
    const shedder: any = { assertNotOverloaded: jest.fn().mockResolvedValue(undefined) };
    const idemModel: any = { create: jest.fn(), findOne: jest.fn(), updateOne: jest.fn() };
    const completeRoundQueue: any = {
      add: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const service = new BidsService(
      bidRepository,
      roundRepository,
      auctionRepository,
      balanceService,
      usersService,
      cacheService,
      eventBus,
      shedder,
      idemModel,
      completeRoundQueue,
    ) as any;

    
    service.getAuctionCached = jest
      .fn()
      .mockResolvedValue({ minBid: 10, minIncrement: 1, winnersPerRound: 1, roundDuration: 30, antiSnipingExtension: 10, totalRounds: 2 });

    
    const round1 = { _id: 'r1', roundNumber: 1 };
    const round2 = { _id: 'r2', roundNumber: 2 };
    service.getActiveRoundCached = jest.fn()
      .mockResolvedValueOnce(round1)
      .mockResolvedValueOnce(round2);

    
    const fakeBidDoc = { _id: 'b1', toObject: () => ({ _id: 'b1', amount: 20 }) };
    service.runWithTransactionRetry = jest.fn()
      .mockRejectedValueOnce(new RoundEndedError('r1'))
      .mockResolvedValueOnce({ bid: fakeBidDoc, antiSniping: undefined });

    const res = await service.placeBid('u1', 'a1', { amount: 20 });

    expect(cacheService.invalidateActiveRound).toHaveBeenCalledWith('a1');
    expect(service.runWithTransactionRetry).toHaveBeenCalledTimes(2);
    expect(res._id).toBe('b1');
  });
});

