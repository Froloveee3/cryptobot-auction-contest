import { MetricsEventsHandler } from './metrics-events.handler';
import { EventBusService } from '../../services/event-bus.service';
import { BidPlacedEvent } from '../bid.events';
import { RoundEndedEvent, RoundStartedEvent } from '../round.events';
import { AuctionEndedEvent, AuctionStartedEvent } from '../auction.events';

describe('MetricsEventsHandler', () => {
  it('increments business metrics on domain events', () => {
    const eventBus = new EventBusService();
    const metrics = {
      bidsTotal: { labels: jest.fn(() => ({ inc: jest.fn() })) },
      roundsTotal: { labels: jest.fn(() => ({ inc: jest.fn() })) },
      auctionsTotal: { labels: jest.fn(() => ({ inc: jest.fn() })) },
    } as any;

    const handler = new MetricsEventsHandler(eventBus, metrics);
    handler.onModuleInit();

    eventBus.publish(
      new RoundStartedEvent('auction-1', {
        auctionId: 'auction-1',
        roundId: 'round-1',
        roundNumber: 1,
        startTime: new Date(),
        endTime: new Date(),
      }),
    );

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

    eventBus.publish(new AuctionStartedEvent('auction-1', 'My Auction'));
    eventBus.publish(new AuctionEndedEvent('auction-1', 'completed'));

    expect(metrics.roundsTotal.labels).toHaveBeenCalledWith('auction-1', 'started');
    expect(metrics.bidsTotal.labels).toHaveBeenCalledWith('auction-1', 'round-1', 'placed');
    expect(metrics.roundsTotal.labels).toHaveBeenCalledWith('auction-1', 'completed');
    expect(metrics.auctionsTotal.labels).toHaveBeenCalledWith('active');
    expect(metrics.auctionsTotal.labels).toHaveBeenCalledWith('completed');

    handler.onModuleDestroy();
  });
});

