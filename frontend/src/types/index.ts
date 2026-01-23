



export type AuctionStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type RoundStatus = 'pending' | 'active' | 'completed';
export type BidStatus = 'active' | 'refunded' | 'won'; 
export type BotType = 'simple' | 'aggressive' | 'sniper' | 'strategic';

export interface User {
  _id: string;
  username: string;
  roles?: Array<'user' | 'admin'>;
  authProvider?: 'web' | 'telegram' | 'legacy';
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Auction {
  _id: string;
  createdBy?: string | null;
  botsEnabled?: boolean;
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
  remainingSupply?: number;
  currentRoundEndsAt?: Date | null;
}

export interface Round {
  _id: string;
  auctionId: string;
  roundNumber: number;
  status: RoundStatus;
  startTime: Date;
  endTime: Date;
  extendedEndTime: Date | null;
  extensionCount: number;
  winnersCount: number;
  participantsCount: number; 
  winners: string[]; 
  createdAt: Date;
  completedAt: Date | null;
}

export interface Bid {
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
}

export interface BalanceTransaction {
  id: string;
  userId: string;
  type: 'deposit' | 'bid_lock' | 'bid_refund' | 'bid_charge' | 'withdrawal';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId: string | null;
  description: string;
  createdAt: Date;
}

export interface UserBidHistoryEntry extends Bid {
  auctionTitle?: string | null;
}

export interface UserGiftCollectionEntry {
  id: string;
  auctionId: string;
  auctionTitle?: string | null;
  giftNumber: number;
  wonRoundNumber: number;
  amount: number;
  wonAt: Date;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  amount: number;
  rank: number; 
  timestamp: Date;
  
}

export interface Bot {
  _id: string;
  name: string;
  type: BotType;
  userId: string;
  auctionId: string | null;
  isActive: boolean;
  minAmount: number;
  maxAmount: number;
  minInterval: number;
  maxInterval: number;
  totalBids: number;
  lastBidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAuctionDto {
  title: string;
  description: string;
  totalRounds: number;
  winnersPerRound: number;
  roundDuration: number;
  minBid?: number;
  minIncrement?: number;
  antiSnipingWindow?: number;
  antiSnipingExtension?: number;
  maxRoundExtensions?: number;
  botsEnabled?: boolean;
  botsCount?: number;
}

export interface CreateBotDto {
  name: string;
  type: BotType;
  userId: string;
  auctionId?: string | null;
  minAmount?: number;
  maxAmount?: number;
  minInterval?: number;
  maxInterval?: number;
}

export interface PlaceBidDto {
  amount: number;
  mode?: 'new' | 'raise'; 
  recipient?: { kind: 'username' | 'telegramId'; value: string } | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
