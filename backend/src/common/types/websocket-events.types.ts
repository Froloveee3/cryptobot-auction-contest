

import { IAuction, IBid } from './entities.types';


export interface AuctionCreatedPayload {
  _id: string;
  title: string;
  description: string;
  status: IAuction['status'];
  totalRounds: number;
  currentRound: number;
  winnersPerRound: number;
  roundDuration: number;
  minBid: number;
  minIncrement: number;
  antiSnipingWindow: number;
  antiSnipingExtension: number;
  maxRoundExtensions: number;
  totalGiftsDistributed: number;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
}


export interface AuctionUpdatedPayload extends Partial<IAuction> {
  _id: string;
  status: IAuction['status'];
  remainingSupply?: number;
  currentRoundEndsAt?: Date | null;
}


export interface RoundStartedPayload {
  auctionId: string;
  roundId: string;
  roundNumber: number;
  startTime: Date;
  endTime: Date;
}


export interface RoundEndedPayload {
  roundId: string;
  roundNumber: number;
  winners: Array<{
    userId: string;
    amount: number;
    giftNumber: number | null;
    recipientUserId: string; 
  }>;
}


export interface RoundExtendedPayload {
  auctionId: string;
  roundId: string;
  roundNumber: number;
  oldEndsAt: Date;
  newEndsAt: Date;
  reason: string;
  topN: number;
}


export interface BidPlacedPayload extends IBid {
  
  displacedUserIds?: string[];
}


export interface AuctionSnapshotPayload {
  auctionId: string;
  seq: number;
  serverTime: number; 
  currentRound: {
    roundId: string | null;
    roundNumber: number | null;
    endsAt: Date | null; 
  };
  remainingSupply: number;
  minBid: number;
  minIncrement: number;
  dynamicMinBid: number;
  cutoffAmount: number | null; 
  top100: Array<{
    userId: string;
    username?: string;
    amount: number;
    rank: number;
  }>;
  me?: {
    userId: string;
    rank: number | null; 
    amount: number | null;
  };
}


export interface AuctionPatchPayload {
  auctionId: string;
  seq: number;
  serverTime: number; 
  currentRound?: {
    roundId: string | null;
    roundNumber: number | null;
    endsAt: Date | null;
  };
  remainingSupply?: number;
  dynamicMinBid?: number;
  cutoffAmount?: number | null;
  
  top100?: Array<{
    userId: string;
    username?: string;
    amount: number;
    rank: number;
  }>;
}

export interface AuctionAckPayload {
  auctionId: string;
  seq: number;
  serverTime: number; 
}


export interface LeaderboardUpdatedPayload {
  roundId: string;
  entries: Array<{
    userId: string;
    username?: string;
    amount: number;
    rank: number;
    giftNumber: number | null;
  }>;
}
