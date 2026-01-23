

import { AuctionStatus, BidStatus } from './api';


export interface AuctionCreatedPayload {
  _id: string;
  createdBy?: string | null;
  title: string;
  description: string;
  status: AuctionStatus;
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
  createdAt: string | Date;
  startedAt: string | Date | null;
  endedAt: string | Date | null;
}

export type LobbyAuctionPayload = AuctionCreatedPayload & {
  remainingSupply?: number;
  currentRoundEndsAt?: string | Date | null;
};

export interface LobbySnapshotPayload {
  tab?: 'active' | 'all' | 'history';
  data: LobbyAuctionPayload[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  serverTime: number; 
}


export interface AuctionSnapshotPayload {
  auctionId: string;
  seq: number; 
  serverTime: number; 
  currentRound: {
    roundId: string | null;
    roundNumber: number | null;
    endsAt: string | Date | null; 
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
    endsAt: string | Date | null;
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


export interface RoundStartedPayload {
  auctionId: string;
  roundId: string;
  roundNumber: number;
  startTime: string | Date;
  endTime: string | Date;
}

export interface RoundExtendedPayload {
  auctionId: string;
  roundId: string;
  roundNumber: number;
  oldEndsAt: string | Date;
  newEndsAt: string | Date;
  reason: string;
  topN: number;
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


export interface BidPlacedPayload {
  _id: string;
  auctionId: string;
  userId: string;
  amount: number;
  status: BidStatus;
  timestamp: string | Date;
  giftNumber: number | null;
  wonRoundNumber: number | null;
  recipientUserId: string | null;
  createdAt: string | Date;
  
  displacedUserIds?: string[];
}


export interface AuctionUpdatedPayload {
  _id: string;
  status: AuctionStatus;
  
  currentRound?: number;
  totalGiftsDistributed?: number;
  endedAt?: string | Date | null;
  remainingSupply?: number;
  currentRoundEndsAt?: string | Date | null;
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


export interface AppPongPayload {
  serverTime: number; 
}


export function normalizeAuctionCreated(payload: AuctionCreatedPayload): {
  _id: string;
  title: string;
  description: string;
  status: AuctionStatus;
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
} {
  const normalizeDate = (v: string | Date | null): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return v;
    return new Date(v);
  };
  return {
    ...payload,
    createdAt: normalizeDate(payload.createdAt)!,
    startedAt: normalizeDate(payload.startedAt),
    endedAt: normalizeDate(payload.endedAt),
  };
}

export function normalizeSnapshotRound(round: AuctionSnapshotPayload['currentRound']): {
  roundId: string | null;
  roundNumber: number | null;
  endsAt: Date | null;
} {
  return {
    ...round,
    endsAt: round.endsAt ? (round.endsAt instanceof Date ? round.endsAt : new Date(round.endsAt)) : null,
  };
}

export function normalizePatchRound(round?: AuctionPatchPayload['currentRound']): {
  roundId: string | null;
  roundNumber: number | null;
  endsAt: Date | null;
} | undefined {
  if (!round) return undefined;
  return {
    ...round,
    endsAt: round.endsAt ? (round.endsAt instanceof Date ? round.endsAt : new Date(round.endsAt)) : null,
  };
}

export function normalizeBidPlaced(payload: BidPlacedPayload): {
  _id: string;
  auctionId: string;
  userId: string;
  amount: number;
  status: BidStatus;
  timestamp: Date;
  giftNumber: number | null;
  wonRoundNumber: number | null;
  recipientUserId: string | null;
  createdAt: Date;
  displacedUserIds?: string[];
} {
  const normalizeDate = (v: string | Date): Date => {
    if (v instanceof Date) return v;
    return new Date(v);
  };
  return {
    ...payload,
    timestamp: normalizeDate(payload.timestamp),
    createdAt: normalizeDate(payload.createdAt),
  };
}

export function normalizeRoundStarted(payload: RoundStartedPayload): {
  auctionId: string;
  roundId: string;
  roundNumber: number;
  startTime: Date;
  endTime: Date;
} {
  const normalizeDate = (v: string | Date): Date => {
    if (v instanceof Date) return v;
    return new Date(v);
  };
  return {
    ...payload,
    startTime: normalizeDate(payload.startTime),
    endTime: normalizeDate(payload.endTime),
  };
}

export function normalizeRoundExtended(payload: RoundExtendedPayload): {
  auctionId: string;
  roundId: string;
  roundNumber: number;
  oldEndsAt: Date;
  newEndsAt: Date;
  reason: string;
  topN: number;
} {
  const normalizeDate = (v: string | Date): Date => {
    if (v instanceof Date) return v;
    return new Date(v);
  };
  return {
    ...payload,
    oldEndsAt: normalizeDate(payload.oldEndsAt),
    newEndsAt: normalizeDate(payload.newEndsAt),
  };
}
