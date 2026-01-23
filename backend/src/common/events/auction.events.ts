import { DomainEvent } from '../services/event-bus.service';
import { AuctionCreatedPayload, AuctionUpdatedPayload } from '../types/websocket-events.types';
import { EventTypes } from './event-types';


export class AuctionCreatedEvent implements DomainEvent {
  eventType = EventTypes.AuctionCreated;
  timestamp: Date;
  requestId?: string;

  constructor(
    public readonly auctionId: string,
    public readonly payload: AuctionCreatedPayload,
    requestId?: string,
  ) {
    this.timestamp = new Date();
    this.requestId = requestId;
  }
}


export class AuctionStartedEvent implements DomainEvent {
  eventType = EventTypes.AuctionStarted;
  timestamp: Date;
  requestId?: string;

  constructor(
    public readonly auctionId: string,
    public readonly title: string,
    requestId?: string,
  ) {
    this.timestamp = new Date();
    this.requestId = requestId;
  }
}


export class AuctionEndedEvent implements DomainEvent {
  eventType = EventTypes.AuctionEnded;
  timestamp: Date;
  requestId?: string;

  constructor(
    public readonly auctionId: string,
    public readonly reason: 'completed' | 'cancelled',
    requestId?: string,
  ) {
    this.timestamp = new Date();
    this.requestId = requestId;
  }
}


export class AuctionUpdatedEvent implements DomainEvent {
  eventType = EventTypes.AuctionUpdated;
  timestamp: Date;
  requestId?: string;

  constructor(
    public readonly auctionId: string,
    public readonly payload: AuctionUpdatedPayload,
    requestId?: string,
  ) {
    this.timestamp = new Date();
    this.requestId = requestId;
  }
}
