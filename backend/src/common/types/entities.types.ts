

export interface IUser {
  _id: string;
  username: string;
  telegramUserId?: string | null;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoundScheduleRule {
  fromRound: number; 
  toRound: number; 
  duration: number; 
  antiSnipingWindow?: number; 
  antiSnipingExtension?: number; 
  maxRoundExtensions?: number; 
  winnersPerRound?: number; 
}

export interface IAuction {
  _id: string;
  createdBy?: string | null;
  botsEnabled?: boolean;
  botsCount?: number;
  title: string;
  description: string;
  status: AuctionStatus;
  totalRounds: number;
  currentRound: number;
  winnersPerRound: number;
  roundDuration: number; 
  antiSnipingWindow: number; 
  antiSnipingExtension: number; 
  maxRoundExtensions: number; 
  totalGiftsDistributed: number; 
  lastBidAt?: Date | null; 
  minBid: number; 
  minIncrement: number; 
  schedule?: RoundScheduleRule[]; 
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface IRound {
  _id: string;
  auctionId: string;
  roundNumber: number;
  status: RoundStatus;
  startTime: Date;
  endTime: Date;
  extendedEndTime: Date | null;
  extensionCount: number;
  winnersCount: number;
  participants: string[]; 
  winners: string[]; 
  createdAt: Date;
  completedAt: Date | null;
  
  roundDuration?: number; 
  antiSnipingWindow?: number; 
  antiSnipingExtension?: number; 
  maxRoundExtensions?: number;
}

export interface IBid {
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

export interface IBalanceTransaction {
  _id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId: string | null; 
  description: string;
  createdAt: Date;
}


export interface IBot {
  _id: string;
  name: string;
  type: 'simple' | 'aggressive' | 'sniper' | 'strategic';
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


export type AuctionStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type RoundStatus = 'pending' | 'active' | 'completed';
export type BidStatus = 'active' | 'refunded' | 'won';
export type TransactionType = 'deposit' | 'bid_lock' | 'bid_refund' | 'bid_charge' | 'withdrawal';
export type BotType = 'simple' | 'aggressive' | 'sniper' | 'strategic';