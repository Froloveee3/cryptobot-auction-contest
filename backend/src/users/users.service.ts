import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IUser, IBalanceTransaction } from '../common/types/entities.types';
import { CreateUserDto, DepositDto, PaginatedResponseDto } from '../common/types/dto.types';
import { IUserService } from '../common/types/service.types';
import { BalanceService } from '../balance/balance.service';
import { UserRepository } from '../common/repositories/user.repository';
import { BidRepository } from '../common/repositories/bid.repository';
import { AuctionRepository } from '../common/repositories/auction.repository';
import { isValidUsername, isValidBotUsername } from '../common/utils/username.util';

@Injectable()
export class UsersService implements IUserService {
  constructor(
    private userRepository: UserRepository,
    private balanceService: BalanceService,
    private bidRepository: BidRepository,
    private auctionRepository: AuctionRepository,
  ) {}

  async create(data: CreateUserDto): Promise<IUser> {
    const normalized = String(data.username || '').trim();
    
    if (!isValidUsername(normalized) && !isValidBotUsername(normalized)) {
      throw new BadRequestException({
        code: 'USERNAME_INVALID_FORMAT',
        message: 'Username must start with a letter and contain only letters and digits',
      });
    }
    const initialBalance = data.initialBalance ?? 0;
    if (!Number.isFinite(initialBalance) || initialBalance < 0) {
      throw new Error('Initial balance must be a non-negative number');
    }

    
    
    
    const saved = await this.userRepository.create({
      username: normalized,
      balance: 0,
    });

    if (initialBalance > 0) {
      await this.balanceService.deposit(saved._id, initialBalance);
      const updated = await this.userRepository.findById(saved._id);
      if (!updated) {
        throw new NotFoundException(`User with ID ${saved._id} not found`);
      }
      return updated;
    }

    return saved;
  }

  async findById(id: string): Promise<IUser | null> {
    return this.userRepository.findById(id);
  }

  async findByUsername(username: string): Promise<IUser | null> {
    return this.userRepository.findByUsername(username);
  }

  async findByTelegramId(telegramUserId: string): Promise<IUser | null> {
    return this.userRepository.findByTelegramId(telegramUserId);
  }

  async deposit(userId: string, data: DepositDto): Promise<IUser> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    await this.balanceService.deposit(userId, data.amount);
    const updated = await this.userRepository.findById(userId);
    if (!updated) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    return updated;
  }

  async getBalance(userId: string): Promise<number> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    return user.balance;
  }

  async checkBalance(userId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(userId);
    return balance >= amount;
  }

  async getTransactions(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponseDto<IBalanceTransaction>> {
    // Implementation will be in BalanceService
    return this.balanceService.getTransactions(userId, page, limit);
  }

  async getBidHistory(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponseDto<any>> {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.bidRepository
        .getModel()
        .find({ userId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.bidRepository.getModel().countDocuments({ userId }).exec(),
    ]);

    const auctionIds = Array.from(new Set(data.map((b: any) => String(b.auctionId || '')).filter(Boolean)));
    const auctions = auctionIds.length > 0 ? await this.auctionRepository.findByIds(auctionIds) : [];
    const titleById = new Map(auctions.map((a) => [String(a._id), String((a as any).title ?? '')]));

    return {
      data: data.map((b: any) => ({
        id: String(b._id),
        auctionId: String(b.auctionId),
        auctionTitle: titleById.get(String(b.auctionId)) || null,
        userId: String(b.userId),
        amount: Number(b.amount),
        status: b.status,
        timestamp: b.timestamp,
        giftNumber: b.giftNumber ?? null,
        wonRoundNumber: b.wonRoundNumber ?? null,
        recipientUserId: b.recipientUserId ?? null,
        createdAt: b.createdAt ?? b.timestamp,
      })),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async getGiftCollection(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponseDto<any>> {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const filter = {
      status: 'won',
      $or: [{ recipientUserId: userId }, { recipientUserId: null, userId }],
    } as any;

    const [data, total] = await Promise.all([
      this.bidRepository
        .getModel()
        .find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.bidRepository.getModel().countDocuments(filter).exec(),
    ]);

    const auctionIds = Array.from(new Set(data.map((b: any) => String(b.auctionId || '')).filter(Boolean)));
    const auctions = auctionIds.length > 0 ? await this.auctionRepository.findByIds(auctionIds) : [];
    const titleById = new Map(auctions.map((a) => [String(a._id), String((a as any).title ?? '')]));

    return {
      data: data
        .filter((b: any) => typeof b.giftNumber === 'number' && typeof b.wonRoundNumber === 'number')
        .map((b: any) => ({
          id: String(b._id),
          auctionId: String(b.auctionId),
          auctionTitle: titleById.get(String(b.auctionId)) || null,
          giftNumber: Number(b.giftNumber),
          wonRoundNumber: Number(b.wonRoundNumber),
          amount: Number(b.amount),
          wonAt: b.timestamp,
        })),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    };
  }
}
