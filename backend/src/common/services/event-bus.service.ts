import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { getCurrentRequestId } from '../utils/request-context';
import { randomUUID } from 'crypto';
import { OutboxService } from '../events/outbox/outbox.service';


export interface DomainEvent {
  eventId?: string;
  eventType: string;
  eventVersion?: number;
  timestamp: Date;
  requestId?: string;
}


export interface EventHandler<T extends DomainEvent> {
  handle(event: T): Promise<void> | void;
}


@Injectable()
export class EventBusService {
  private readonly eventSubject = new Subject<DomainEvent>();

  constructor(
    @Optional() private readonly outbox?: OutboxService,
    @Optional() @InjectQueue('outbox-dispatch') private readonly outboxDispatchQueue?: Queue,
  ) {}

  private enrich(event: DomainEvent): void {
    if (!event.eventId) (event as any).eventId = randomUUID();
    if (!event.eventVersion) (event as any).eventVersion = 1;
    if (!event.requestId) {
      const rid = getCurrentRequestId();
      if (rid) (event as any).requestId = rid;
    }
  }

  
  emit<T extends DomainEvent>(event: T): void {
    this.enrich(event);
    this.eventSubject.next(event);
  }

  
  publish<T extends DomainEvent>(
    event: T,
    opts?: { persist?: boolean; emit?: boolean; statusWhenPersisted?: 'pending' | 'published'; session?: any },
  ): void {
    this.enrich(event);
    const persist = opts?.persist ?? (Boolean(opts?.session) || opts?.emit === false);
    const emit = opts?.emit ?? true;

    if (persist && this.outbox) {
      const status = opts?.statusWhenPersisted ?? (emit ? 'published' : 'pending');
      
      void this.outbox
        .enqueue(event, { session: opts?.session, status })
        .then(() => {
          
          
          if (status === 'pending' && !opts?.session) {
            return this.outboxDispatchQueue
              ?.add('dispatch', {}, { jobId: 'dispatch-outbox', removeOnComplete: true, removeOnFail: true })
              .catch(() => undefined);
          }
          return undefined;
        })
        .catch(() => undefined);
    }

    if (emit) {
      this.eventSubject.next(event);
    }
  }

  
  async publishAsync<T extends DomainEvent>(
    event: T,
    opts?: { persist?: boolean; emit?: boolean; statusWhenPersisted?: 'pending' | 'published'; session?: any },
  ): Promise<void> {
    this.enrich(event);
    const persist = opts?.persist ?? (Boolean(opts?.session) || opts?.emit === false);
    const emit = opts?.emit ?? true;

    if (persist && this.outbox) {
      const status = opts?.statusWhenPersisted ?? (emit ? 'published' : 'pending');
      await this.outbox.enqueue(event, { session: opts?.session, status });

      
      if (status === 'pending' && !opts?.session) {
        await this.outboxDispatchQueue
          ?.add('dispatch', {}, { jobId: 'dispatch-outbox', removeOnComplete: true, removeOnFail: true })
          .catch(() => undefined);
      }
    }

    if (emit) {
      this.eventSubject.next(event);
    }
  }

  
  ofType<T extends DomainEvent>(eventType: string): Observable<T> {
    return this.eventSubject.asObservable().pipe(
      filter((event): event is T => event.eventType === eventType),
    ) as Observable<T>;
  }

  
  subscribe(handler: (event: DomainEvent) => void): void {
    this.eventSubject.asObservable().subscribe(handler);
  }
}
