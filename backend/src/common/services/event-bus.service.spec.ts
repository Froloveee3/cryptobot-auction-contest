import { EventBusService, DomainEvent } from './event-bus.service';
import { runWithRequestId } from '../utils/request-context';

class TestEvent implements DomainEvent {
  eventType = 'TestEvent';
  timestamp = new Date();
  requestId?: string;
  eventId?: string;
  eventVersion?: number;
}

describe('EventBusService requestId enrichment', () => {
  it('auto-fills requestId from async context when missing', (done) => {
    const bus = new EventBusService();
    bus.ofType<TestEvent>('TestEvent').subscribe((e) => {
      expect(e.requestId).toBe('rid-123');
      expect(e.eventVersion).toBe(1);
      expect(typeof e.eventId).toBe('string');
      done();
    });

    runWithRequestId('rid-123', () => {
      bus.publish(new TestEvent());
    });
  });

  it('does not override explicitly provided requestId', (done) => {
    const bus = new EventBusService();
    bus.ofType<TestEvent>('TestEvent').subscribe((e) => {
      expect(e.requestId).toBe('explicit');
      expect(e.eventVersion).toBe(1);
      expect(typeof e.eventId).toBe('string');
      done();
    });

    runWithRequestId('rid-ctx', () => {
      const ev = new TestEvent();
      ev.requestId = 'explicit';
      bus.publish(ev);
    });
  });

  it('kicks outbox dispatcher when persisting pending events', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const add = jest.fn().mockResolvedValue(undefined);

    const bus = new EventBusService({ enqueue } as any, { add } as any);
    const ev = new TestEvent();

    
    bus.publish(ev, { emit: false });

    
    await new Promise((r) => setImmediate(r));

    expect(enqueue).toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith('dispatch', {}, expect.objectContaining({ jobId: 'dispatch-outbox' }));
  });
});

