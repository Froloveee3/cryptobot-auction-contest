import { EventBusService } from '../common/services/event-bus.service';
import { RoundJobsEventsHandler } from './round-jobs-events.handler';
import { RoundStartedEvent, RoundExtendedEvent } from '../common/events/round.events';

describe('RoundJobsEventsHandler', () => {
  it('schedules completion job on RoundStartedEvent', async () => {
    const eventBus = new EventBusService();
    const roundJobs = { scheduleCompleteRound: jest.fn().mockResolvedValue(undefined) } as any;

    const handler = new RoundJobsEventsHandler(eventBus, roundJobs);
    handler.onModuleInit();

    const endTime = new Date(Date.now() + 60_000);
    eventBus.publish(
      new RoundStartedEvent('auction-1', {
        auctionId: 'auction-1',
        roundId: 'round-1',
        roundNumber: 1,
        startTime: new Date(),
        endTime,
      }),
    );

    await new Promise((r) => setImmediate(r));
    expect(roundJobs.scheduleCompleteRound).toHaveBeenCalledWith({
      roundId: 'round-1',
      auctionId: 'auction-1',
      endsAt: endTime,
    });

    handler.onModuleDestroy();
  });

  it('reschedules completion job on RoundExtendedEvent', async () => {
    const eventBus = new EventBusService();
    const roundJobs = { scheduleCompleteRound: jest.fn().mockResolvedValue(undefined) } as any;

    const handler = new RoundJobsEventsHandler(eventBus, roundJobs);
    handler.onModuleInit();

    const newEndsAt = new Date(Date.now() + 90_000);
    eventBus.publish(
      new RoundExtendedEvent({
        auctionId: 'auction-1',
        roundId: 'round-1',
        roundNumber: 1,
        oldEndsAt: new Date(),
        newEndsAt,
        reason: 'late_bid_in_topN',
        topN: 3,
      }),
    );

    await new Promise((r) => setImmediate(r));
    expect(roundJobs.scheduleCompleteRound).toHaveBeenCalledWith({
      roundId: 'round-1',
      auctionId: 'auction-1',
      endsAt: newEndsAt,
    });

    handler.onModuleDestroy();
  });
});

