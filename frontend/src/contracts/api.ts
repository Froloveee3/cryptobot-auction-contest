


export type AuctionStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type RoundStatus = 'pending' | 'active' | 'completed';
export type BidStatus = 'active' | 'refunded' | 'won';
export type TransactionType = 'deposit' | 'bid_lock' | 'bid_refund' | 'bid_charge' | 'withdrawal';


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
  schedule?: Array<{
    fromRound: number;
    toRound: number;
    duration: number;
    antiSnipingWindow?: number;
    antiSnipingExtension?: number;
    maxRoundExtensions?: number;
    winnersPerRound?: number;
  }>;
}

export interface PlaceBidDto {
  amount: number;
  mode?: 'new' | 'raise';
  recipient?: { kind: 'username' | 'telegramId'; value: string } | null;
}

export interface DepositDto {
  amount: number;
}

export interface RegisterDto {
  username: string;
  password: string;
}

export interface LoginDto {
  username: string;
  password: string;
}




export interface UserResponseDto {
  id: string;
  username: string;
  balance: number;
  createdAt: string | Date; 
  updatedAt: string | Date;
}

export interface AuctionResponseDto {
  id: string;
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

export interface RoundResponseDto {
  id: string;
  auctionId: string;
  roundNumber: number;
  status: RoundStatus;
  startTime: string | Date;
  endTime: string | Date;
  extendedEndTime: string | Date | null;
  extensionCount: number;
  winnersCount: number;
  participantsCount: number;
  winners: string[];
  createdAt: string | Date;
  completedAt: string | Date | null;
}

export interface BidResponseDto {
  id: string; 
  auctionId: string;
  userId: string;
  amount: number;
  status: BidStatus;
  timestamp: string | Date;
  giftNumber: number | null;
  wonRoundNumber: number | null;
  recipientUserId: string | null; 
  createdAt: string | Date;
}

export interface BalanceTransactionResponseDto {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId: string | null;
  description: string;
  createdAt: string | Date;
}

export interface UserBidHistoryEntryDto extends BidResponseDto {
  auctionTitle?: string | null;
}

export interface UserGiftCollectionEntryDto {
  id: string; 
  auctionId: string;
  auctionTitle?: string | null;
  giftNumber: number;
  wonRoundNumber: number;
  amount: number;
  wonAt: string | Date;
}

export interface LeaderboardEntryDto {
  userId: string;
  username: string;
  amount: number;
  rank: number;
  timestamp: string | Date;
}

export interface PaginatedResponseDto<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuthTokenResponse {
  accessToken: string;
}




export function normalizeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

export function normalizeUser(dto: UserResponseDto): {
  _id: string;
  username: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    _id: dto.id,
    username: dto.username,
    balance: dto.balance,
    createdAt: normalizeDate(dto.createdAt)!,
    updatedAt: normalizeDate(dto.updatedAt)!,
  };
}

export function normalizeAuction(dto: AuctionResponseDto): {
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
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
} {
  return {
    _id: dto.id,
    createdBy: dto.createdBy ?? null,
    title: dto.title,
    description: dto.description,
    status: dto.status,
    totalRounds: dto.totalRounds,
    currentRound: dto.currentRound,
    winnersPerRound: dto.winnersPerRound,
    roundDuration: dto.roundDuration,
    minBid: dto.minBid,
    minIncrement: dto.minIncrement,
    antiSnipingWindow: dto.antiSnipingWindow,
    antiSnipingExtension: dto.antiSnipingExtension,
    maxRoundExtensions: dto.maxRoundExtensions,
    totalGiftsDistributed: dto.totalGiftsDistributed,
    createdAt: normalizeDate(dto.createdAt)!,
    startedAt: normalizeDate(dto.startedAt),
    endedAt: normalizeDate(dto.endedAt),
  };
}

export function normalizeRound(dto: RoundResponseDto): {
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
} {
  return {
    _id: dto.id,
    auctionId: dto.auctionId,
    roundNumber: dto.roundNumber,
    status: dto.status,
    startTime: normalizeDate(dto.startTime)!,
    endTime: normalizeDate(dto.endTime)!,
    extendedEndTime: normalizeDate(dto.extendedEndTime),
    extensionCount: dto.extensionCount,
    winnersCount: dto.winnersCount,
    participantsCount: dto.participantsCount,
    winners: dto.winners,
    createdAt: normalizeDate(dto.createdAt)!,
    completedAt: normalizeDate(dto.completedAt),
  };
}

export function normalizeBid(dto: BidResponseDto): {
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
} {
  return {
    _id: dto.id,
    auctionId: dto.auctionId,
    userId: dto.userId,
    amount: dto.amount,
    status: dto.status,
    timestamp: normalizeDate(dto.timestamp)!,
    giftNumber: dto.giftNumber,
    wonRoundNumber: dto.wonRoundNumber,
    recipientUserId: dto.recipientUserId,
    createdAt: normalizeDate(dto.createdAt)!,
  };
}

export function normalizeBalanceTransaction(dto: BalanceTransactionResponseDto): {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId: string | null;
  description: string;
  createdAt: Date;
} {
  return {
    id: dto.id,
    userId: dto.userId,
    type: dto.type,
    amount: dto.amount,
    balanceBefore: dto.balanceBefore,
    balanceAfter: dto.balanceAfter,
    referenceId: dto.referenceId ?? null,
    description: dto.description,
    createdAt: normalizeDate(dto.createdAt)!,
  };
}

export function normalizeUserGiftCollectionEntry(dto: UserGiftCollectionEntryDto): {
  id: string;
  auctionId: string;
  auctionTitle?: string | null;
  giftNumber: number;
  wonRoundNumber: number;
  amount: number;
  wonAt: Date;
} {
  return {
    id: dto.id,
    auctionId: dto.auctionId,
    auctionTitle: dto.auctionTitle ?? null,
    giftNumber: dto.giftNumber,
    wonRoundNumber: dto.wonRoundNumber,
    amount: dto.amount,
    wonAt: normalizeDate(dto.wonAt)!,
  };
}

export function normalizeLeaderboardEntry(dto: LeaderboardEntryDto): {
  userId: string;
  username: string;
  amount: number;
  rank: number;
  timestamp: Date;
} {
  return {
    userId: dto.userId,
    username: dto.username,
    amount: dto.amount,
    rank: dto.rank,
    timestamp: normalizeDate(dto.timestamp)!,
  };
}
