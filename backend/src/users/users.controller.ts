import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, Req, UseGuards, HttpCode } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  DepositDto,
  PaginatedResponseDto,
  BalanceTransactionResponseDto,
  UserBidHistoryEntryDto,
  UserGiftCollectionEntryDto,
} from '../common/types/dto.types';
import { IUser } from '../common/types/entities.types';
import { DualAuthGuard } from '../auth/dual-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { isValidUsername } from '../common/utils/username.util';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user (strict auth)' })
  @ApiOkResponse({ description: 'Current user' })
  @UseGuards(DualAuthGuard)
  async me(@Req() req: any): Promise<IUser | null> {
    const userId = String(req.user?.sub || '');
    return this.usersService.findById(userId);
  }

  @Post('me/deposit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Deposit/withdraw for current user (strict auth)' })
  @ApiOkResponse({ description: 'Deposit successful' })
  @UseGuards(DualAuthGuard)
  async depositMe(@Req() req: any, @Body() depositDto: DepositDto): Promise<IUser> {
    const userId = String(req.user?.sub || '');
    return this.usersService.deposit(userId, depositDto);
  }

  @Get('me/transactions')
  @ApiOperation({ summary: 'Get current user balance transaction history (strict auth)' })
  @ApiOkResponse({ description: 'Transactions retrieved' })
  @UseGuards(DualAuthGuard)
  async getMyTransactions(
    @Req() req: any,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ): Promise<PaginatedResponseDto<BalanceTransactionResponseDto>> {
    const userId = String(req.user?.sub || '');
    const result = await this.usersService.getTransactions(userId, page, limit);
    return {
      ...result,
      data: result.data.map((item) => ({
        id: item._id,
        userId: item.userId,
        type: item.type,
        amount: item.amount,
        balanceBefore: item.balanceBefore,
        balanceAfter: item.balanceAfter,
        referenceId: item.referenceId,
        description: item.description,
        createdAt: item.createdAt,
      })),
    };
  }

  @Get('me/bids')
  @ApiOperation({ summary: 'Get current user bid history (strict auth)' })
  @ApiOkResponse({ description: 'Bids retrieved' })
  @UseGuards(DualAuthGuard)
  async getMyBids(
    @Req() req: any,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ): Promise<PaginatedResponseDto<UserBidHistoryEntryDto>> {
    const userId = String(req.user?.sub || '');
    return this.usersService.getBidHistory(userId, page, limit);
  }

  @Get('me/collection')
  @ApiOperation({ summary: 'Get current user gift collection (won gifts) (strict auth)' })
  @ApiOkResponse({ description: 'Collection retrieved' })
  @UseGuards(DualAuthGuard)
  async getMyCollection(
    @Req() req: any,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ): Promise<PaginatedResponseDto<UserGiftCollectionEntryDto>> {
    const userId = String(req.user?.sub || '');
    return this.usersService.getGiftCollection(userId, page, limit);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiCreatedResponse({ description: 'User created successfully' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async create(@Body() createUserDto: CreateUserDto): Promise<IUser> {
    return this.usersService.create(createUserDto);
  }

  @Get('lookup')
  @ApiOperation({ summary: 'Lookup user by username or telegramId (strict auth)' })
  @ApiOkResponse({ description: 'Lookup result' })
  @UseGuards(DualAuthGuard)
  async lookup(
    @Query('kind') kind?: 'username' | 'telegramId',
    @Query('value') value?: string,
  ): Promise<{ exists: boolean; userId?: string; username?: string; telegramUserId?: string }> {
    const normalizedKind = String(kind || '').trim() as 'username' | 'telegramId';
    const normalizedValue = String(value || '').trim();
    if (!normalizedKind || !normalizedValue) return { exists: false };

    if (normalizedKind === 'username') {
      if (!isValidUsername(normalizedValue)) return { exists: false };
      const user = await this.usersService.findByUsername(normalizedValue);
      if (!user) return { exists: false };
      return { exists: true, userId: user._id, username: user.username, telegramUserId: user.telegramUserId ?? undefined };
    }

    if (normalizedKind === 'telegramId') {
      const user = await this.usersService.findByTelegramId(normalizedValue);
      if (!user) return { exists: false };
      return { exists: true, userId: user._id, username: user.username, telegramUserId: user.telegramUserId ?? undefined };
    }

    return { exists: false };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiOkResponse({ description: 'User found' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async findById(@Param('id') id: string): Promise<IUser | null> {
    return this.usersService.findById(id);
  }

  @Post(':id/deposit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Deposit funds to user account' })
  @ApiOkResponse({ description: 'Deposit successful' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async deposit(@Param('id') id: string, @Body() depositDto: DepositDto): Promise<IUser> {
    return this.usersService.deposit(id, depositDto);
  }

  @Get(':id/balance')
  @ApiOperation({ summary: 'Get user balance' })
  @ApiOkResponse({ description: 'Balance retrieved' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async getBalance(@Param('id') id: string): Promise<number> {
    return this.usersService.getBalance(id);
  }

  @Get(':id/transactions')
  @ApiOperation({ summary: 'Get user transaction history' })
  @ApiOkResponse({ description: 'Transactions retrieved' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async getTransactions(
    @Param('id') id: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ): Promise<PaginatedResponseDto<BalanceTransactionResponseDto>> {
    const result = await this.usersService.getTransactions(id, page, limit);
    return {
      ...result,
      data: result.data.map((item) => ({
        id: item._id,
        userId: item.userId,
        type: item.type,
        amount: item.amount,
        balanceBefore: item.balanceBefore,
        balanceAfter: item.balanceAfter,
        referenceId: item.referenceId,
        description: item.description,
        createdAt: item.createdAt,
      })),
    };
  }
}
