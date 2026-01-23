import { OutboxDispatcherService } from './outbox-dispatcher.service';

describe('OutboxDispatcherService', () => {
  it('claims one event, emits it, and marks published', async () => {
    const outbox = {
      claimNext: jest.fn().mockResolvedValue({
        eventId: 'e1',
        eventType: 'TestEvent',
        event: { eventType: 'TestEvent', timestamp: new Date(), eventId: 'e1', eventVersion: 1 },
        attempts: 0,
      }),
      markPublished: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    } as any;

    const eventBus = { emit: jest.fn() } as any;
    const svc = new OutboxDispatcherService(outbox, eventBus);
    await svc.drainBatch(10);

    expect(outbox.claimNext).toHaveBeenCalled();
    expect(eventBus.emit).toHaveBeenCalled();
    expect(outbox.markPublished).toHaveBeenCalledWith('e1');
  });

  it('moves event to dead-letter after max attempts', async () => {
    const outbox = {
      claimNext: jest.fn().mockResolvedValue({
        eventId: 'e1',
        eventType: 'TestEvent',
        event: { eventType: 'TestEvent', timestamp: new Date(), eventId: 'e1', eventVersion: 1 },
        attempts: 10,
      }),
      markPublished: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markDead: jest.fn().mockResolvedValue(undefined),
    } as any;

    const eventBus = { emit: jest.fn(() => { throw new Error('boom'); }) } as any;
    const svc = new OutboxDispatcherService(outbox, eventBus);
    await svc.drainBatch(1);

    expect(outbox.markDead).toHaveBeenCalledWith('e1', expect.anything());
  });
});

