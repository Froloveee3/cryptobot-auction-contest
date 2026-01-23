import { EventBusService } from '../../services/event-bus.service';
import { AuditEventsHandler } from './audit-events.handler';
import { BidPlacedEvent } from '../bid.events';
import { RoundEndedEvent } from '../round.events';
import { AuctionEndedEvent, AuctionStartedEvent } from '../auction.events';

describe('AuditEventsHandler', () => {
  it('persists key domain events to audit store (best effort)', async () => {
    const eventBus = new EventBusService();
    const audit = {
      append: jest.fn().mockResolvedValue(undefined),
    } as any;

    const handler = new AuditEventsHandler(eventBus, audit);
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

    eventBus.publish(new AuctionStartedEvent('auction-1', 'My Auction'));
    eventBus.publish(new AuctionEndedEvent('auction-1', 'completed'));

    
    await new Promise((r) => setImmediate(r));

    expect(audit.append).toHaveBeenCalledTimes(4);
    handler.onModuleDestroy();
  });

  it('never throws if audit store fails', async () => {
    const eventBus = new EventBusService();
    const audit = {
      append: jest.fn().mockRejectedValue(new Error('db down')),
    } as any;

    const handler = new AuditEventsHandler(eventBus, audit);
    handler.onModuleInit();

    expect(() => {
      eventBus.publish(new AuctionEndedEvent('auction-1', 'completed'));
    }).not.toThrow();

    await new Promise((r) => setImmediate(r));
    handler.onModuleDestroy();
  });

  it('ignores duplicate key errors (idempotency)', async () => {
    const eventBus = new EventBusService();
    const dup = Object.assign(new Error('dup'), { code: 11000 });
    const audit = {
      append: jest.fn().mockRejectedValue(dup),
    } as any;

    const handler = new AuditEventsHandler(eventBus, audit);
    handler.onModuleInit();

    eventBus.publish(new AuctionStartedEvent('auction-1', 'My Auction'));
    await new Promise((r) => setImmediate(r));

    expect(audit.append).toHaveBeenCalledTimes(1);
    handler.onModuleDestroy();
  });
});

