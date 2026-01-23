

import { IUser, IAuction, IRound, IBid, IBalanceTransaction, TransactionType } from './entities.types';
import {
  CreateUserDto,
  DepositDto,
  CreateAuctionDto,
  PlaceBidDto,
  GetAuctionsQueryDto,
  GetBidsQueryDto,
  PaginatedResponseDto,
  LeaderboardEntryDto,
} from './dto.types';


export interface IUserService {
  create(data: CreateUserDto): Promise<IUser>;
  findById(id: string): Promise<IUser | null>;
  findByUsername(username: string): Promise<IUser | null>;
  findByTelegramId(telegramUserId: string): Promise<IUser | null>;
  deposit(userId: string, data: DepositDto): Promise<IUser>;
  getBalance(userId: string): Promise<number>;
  checkBalance(userId: string, amount: number): Promise<boolean>;
  getTransactions(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponseDto<IBalanceTransaction>>;
}


export interface IAuctionService {
  create(data: CreateAuctionDto, userId?: string): Promise<IAuction>;
  findById(id: string): Promise<IAuction | null>;
  findAll(query: GetAuctionsQueryDto, requester?: { userId?: string; roles?: Array<'user' | 'admin'> }): Promise<PaginatedResponseDto<IAuction>>;
  start(id: string): Promise<IAuction>;
  getCurrentRound(auctionId: string): Promise<IRound | null>;
  getRounds(auctionId: string): Promise<IRound[]>;
  getMyDraft(userId: string): Promise<IAuction | null>;
}


export interface IRoundService {
  create(auctionId: string, roundNumber: number): Promise<IRound>;
  start(roundId: string): Promise<IRound>;
  complete(roundId: string): Promise<IRound>;
  extend(roundId: string, extensionSeconds: number): Promise<IRound>;
  findById(id: string): Promise<IRound | null>;
  findByAuction(auctionId: string): Promise<IRound[]>;
  findByAuctionAndNumber(auctionId: string, roundNumber: number): Promise<IRound | null>;
  getActiveRound(auctionId: string): Promise<IRound | null>;
  getLeaderboard(roundId: string, limit?: number): Promise<LeaderboardEntryDto[]>;
}


export interface IBidService {
  placeBid(userId: string, auctionId: string, data: PlaceBidDto): Promise<IBid>;
  findByAuction(auctionId: string, query: GetBidsQueryDto): Promise<PaginatedResponseDto<IBid>>;
}


export interface IBalanceService {
  
  
  
  lock(userId: string, amount: number, referenceId: string, session?: import('mongoose').ClientSession): Promise<void>;
  charge(userId: string, amount: number, referenceId: string, session?: import('mongoose').ClientSession): Promise<void>;
  refund(userId: string, amount: number, referenceId: string, session?: import('mongoose').ClientSession): Promise<void>;
  deposit(userId: string, amount: number): Promise<void>;
  createTransaction(
    userId: string,
    type: TransactionType,
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    referenceId: string | null,
    description: string,
    session?: import('mongoose').ClientSession,
  ): Promise<IBalanceTransaction>;
}
