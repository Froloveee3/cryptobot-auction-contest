

import { IAuction, IRound, IBid } from './entities.types';


export interface AuctionUpdatedEvent {
  auction: IAuction;
  timestamp: Date;
}

export interface RoundStartedEvent {
  round: IRound;
  auction: IAuction;
  timestamp: Date;
}

export interface RoundEndedEvent {
  round: IRound;
  auction: IAuction;
  winners: string[];
  timestamp: Date;
}

export interface RoundExtendedEvent {
  round: IRound;
  auction: IAuction;
  newEndTime: Date;
  extensionCount: number;
  timestamp: Date;
}

export interface BidPlacedEvent {
  bid: IBid;
  auction: IAuction;
  round: IRound;
  newLeaderboard: Array<{
    userId: string;
    username: string;
    amount: number;
    rank: number;
  }>;
  timestamp: Date;
}

export interface LeaderboardUpdatedEvent {
  roundId: string;
  auctionId: string;
  leaderboard: Array<{
    userId: string;
    username: string;
    amount: number;
    rank: number;
  }>;
  timestamp: Date;
}


export interface JoinAuctionEvent {
  auctionId: string;
}

export interface LeaveAuctionEvent {
  auctionId: string;
}


export type InternalEventType =
  | 'round.complete'
  | 'round.start'
  | 'bid.placed'
  | 'auction.complete'
  | 'balance.updated';

export interface InternalEvent<T = Record<string, never>> {
  type: InternalEventType;
  payload: T;
  timestamp: Date;
}

export interface RoundCompleteEventPayload {
  roundId: string;
  auctionId: string;
  winners: string[];
  losers: string[];
}

export interface BidPlacedInternalEventPayload {
  bidId: string;
  userId: string;
  auctionId: string;
  roundId: string;
  amount: number;
}
