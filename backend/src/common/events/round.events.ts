import { DomainEvent } from '../services/event-bus.service';
import { RoundEndedPayload, RoundExtendedPayload, RoundStartedPayload } from '../types/websocket-events.types';
import { EventTypes } from './event-types';


export class RoundStartedEvent implements DomainEvent {
  eventType = EventTypes.RoundStarted;
  timestamp: Date;
  requestId?: string;

  constructor(
    public readonly auctionId: string,
    public readonly payload: RoundStartedPayload,
    requestId?: string,
  ) {
    this.timestamp = new Date();
    this.requestId = requestId;
  }
}


export class RoundEndedEvent implements DomainEvent {
  eventType = EventTypes.RoundEnded;
  timestamp: Date;
  requestId?: string;

  constructor(
    public readonly auctionId: string,
    public readonly payload: RoundEndedPayload,
    requestId?: string,
  ) {
    this.timestamp = new Date();
    this.requestId = requestId;
  }
}


export class RoundExtendedEvent implements DomainEvent {
  eventType = EventTypes.RoundExtended;
  timestamp: Date;
  requestId?: string;

  constructor(
    public readonly payload: RoundExtendedPayload,
    requestId?: string,
  ) {
    this.timestamp = new Date();
    this.requestId = requestId;
  }
}
