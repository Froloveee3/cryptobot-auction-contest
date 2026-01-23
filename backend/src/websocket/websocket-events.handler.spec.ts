import { EventBusService } from '../common/services/event-bus.service';
import { WebsocketEventsHandler } from './websocket-events.handler';
import { RoundStartedEvent, RoundEndedEvent, RoundExtendedEvent } from '../common/events/round.events';
import { BidPlacedEvent } from '../common/events/bid.events';
import { AuctionUpdatedEvent } from '../common/events/auction.events';

describe('WebsocketEventsHandler', () => {
  it('bridges domain events to WebsocketGateway emitters', () => {
    const eventBus = new EventBusService();
    const gateway = {
      emitRoundStarted: jest.fn(),
      emitRoundEnded: jest.fn(),
      emitRoundExtended: jest.fn(),
      emitBidPlaced: jest.fn(),
      emitAuctionUpdated: jest.fn(),
      emitAuctionCreated: jest.fn(),
      emitLobbyAuctionUpdated: jest.fn(),
      server: {
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      },
    } as any;
    const auctions = {
      findById: jest.fn().mockResolvedValue({
        _id: 'auction-1',
        status: 'active',
        currentRound: 1,
        totalRounds: 3,
        winnersPerRound: 2,
        totalGiftsDistributed: 0,
      }),
    } as any;
    const lobbyCache = {
      rebuildAll: jest.fn().mockResolvedValue([]),
    } as any;

    const handler = new WebsocketEventsHandler(eventBus, gateway, auctions, lobbyCache);
    handler.onModuleInit();

    eventBus.publish(
      new RoundStartedEvent('auction-1', {
        auctionId: 'auction-1',
        roundId: 'round-1',
        roundNumber: 1,
        startTime: new Date('2026-01-01T00:00:00.000Z'),
        endTime: new Date('2026-01-01T00:01:00.000Z'),
      }),
    );

    eventBus.publish(
      new RoundEndedEvent('auction-1', {
        roundId: 'round-1',
        roundNumber: 1,
        winners: [
          { userId: 'u1', amount: 10, giftNumber: 1, recipientUserId: 'u1' },
          { userId: 'u2', amount: 9, giftNumber: 2, recipientUserId: 'u3' },
        ],
      }),
    );

    eventBus.publish(
      new RoundExtendedEvent({
        auctionId: 'auction-1',
        roundId: 'round-1',
        roundNumber: 1,
        oldEndsAt: new Date('2026-01-01T00:01:00.000Z'),
        newEndsAt: new Date('2026-01-01T00:01:30.000Z'),
        reason: 'late_bid_in_topN',
        topN: 3,
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
        timestamp: new Date('2026-01-01T00:00:10.000Z'),
        giftNumber: null,
        previousBidId: null,
        originalRoundId: null,
        recipientUserId: 'u1',
      } as any),
    );

    eventBus.publish(
      new AuctionUpdatedEvent('auction-1', {
        _id: 'auction-1',
        status: 'completed',
        endedAt: new Date('2026-01-01T00:01:00.000Z'),
      } as any),
    );

    expect(gateway.emitRoundStarted).toHaveBeenCalledTimes(1);
    expect(gateway.emitRoundEnded).toHaveBeenCalledTimes(1);
    expect(gateway.emitRoundExtended).toHaveBeenCalledTimes(1);
    expect(gateway.emitBidPlaced).toHaveBeenCalledTimes(1);
    expect(gateway.emitAuctionUpdated).toHaveBeenCalledTimes(1);

    handler.onModuleDestroy();
  });
});

