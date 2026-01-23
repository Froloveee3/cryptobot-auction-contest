import { CacheEventsHandler } from './cache-events.handler';
import { EventBusService } from '../../services/event-bus.service';
import { BidPlacedEvent } from '../bid.events';
import { RoundEndedEvent, RoundExtendedEvent } from '../round.events';
import { AuctionUpdatedEvent } from '../auction.events';

describe('CacheEventsHandler', () => {
  it('invalidates caches on key domain events', async () => {
    const eventBus = new EventBusService();
    const cacheService = {
      invalidateRound: jest.fn().mockResolvedValue(undefined),
      invalidateActiveRound: jest.fn().mockResolvedValue(undefined),
      invalidateAuction: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    } as any;

    const handler = new CacheEventsHandler(eventBus, cacheService);
    handler.onModuleInit();

    eventBus.publish(
      new BidPlacedEvent('auction-1', {
        _id: 'bid-1',
        userId: 'u1',
        auctionId: 'auction-1',
        roundId: 'round-1',
        amount: 10,
        status: 'active',
        timestamp: new Date(),
        giftNumber: null,
        previousBidId: null,
        originalRoundId: null,
        recipientUserId: 'u1',
      } as any),
    );

    eventBus.publish(
      new RoundEndedEvent('auction-1', {
        roundId: 'round-1',
        roundNumber: 1,
        winners: [{ userId: 'u1', amount: 10, giftNumber: 1, recipientUserId: 'u1' }],
      }),
    );

    eventBus.publish(
      new AuctionUpdatedEvent('auction-1', {
        _id: 'auction-1',
        status: 'completed',
        endedAt: new Date(),
      } as any),
    );

    eventBus.publish(
      new RoundExtendedEvent({
        auctionId: 'auction-1',
        roundId: 'round-1',
        roundNumber: 1,
        oldEndsAt: new Date(),
        newEndsAt: new Date(),
        reason: 'late_bid_in_topN',
        topN: 3,
      }),
    );

    
    await new Promise((r) => setImmediate(r));

    expect(cacheService.invalidateRound).toHaveBeenCalledWith('round-1');
    expect(cacheService.invalidateActiveRound).toHaveBeenCalledWith('auction-1');
    expect(cacheService.invalidateAuction).toHaveBeenCalledWith('auction-1');
    expect(cacheService.delete).toHaveBeenCalled();

    handler.onModuleDestroy();
  });
});

