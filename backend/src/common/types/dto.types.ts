

import { AuctionStatus, RoundStatus, BidStatus, TransactionType } from './entities.types';


export interface CreateUserDto {
  username: string;
  initialBalance?: number;
}

export interface DepositDto {
  amount: number;
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

export interface GetAuctionsQueryDto {
  status?: AuctionStatus | 'history' | 'all';
  page?: number;
  limit?: number;
}

export interface GetBidsQueryDto {
  userId?: string;
  page?: number;
  limit?: number;
}


export interface UserResponseDto {
  id: string;
  username: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface RoundResponseDto {
  id: string;
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

export interface BidResponseDto {
  id: string;
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

export interface LeaderboardEntryDto {
  userId: string;
  username: string;
  amount: number;
  rank: number;
  timestamp: Date;
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
  createdAt: Date;
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
  wonAt: Date; 
}

export interface PaginatedResponseDto<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ErrorResponseDto {
  statusCode: number;
  message: string;
  error: string;
  timestamp: Date;
  path: string;
}
