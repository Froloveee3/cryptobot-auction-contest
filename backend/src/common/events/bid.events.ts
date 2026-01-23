import { DomainEvent } from '../services/event-bus.service';
import { BidPlacedPayload } from '../types/websocket-events.types';
import { EventTypes } from './event-types';


export class BidPlacedEvent implements DomainEvent {
  eventType = EventTypes.BidPlaced;
  timestamp: Date;
  requestId?: string;

  constructor(
    public readonly auctionId: string,
    public readonly payload: BidPlacedPayload,
    requestId?: string,
  ) {
    this.timestamp = new Date();
    this.requestId = requestId;
  }
}
