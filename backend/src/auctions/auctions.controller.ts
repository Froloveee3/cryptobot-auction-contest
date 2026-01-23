import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards, HttpCode, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuctionsService } from './auctions.service';
import {
  CreateAuctionDto,
  GetAuctionsQueryDto,
  AuctionResponseDto,
  PaginatedResponseDto,
} from '../common/types/dto.types';
import { IAuction, IRound } from '../common/types/entities.types';
import { DualAuthGuard } from '../auth/dual-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('auctions')
@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new auction' })
  @ApiCreatedResponse({ description: 'Auction created successfully' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('user', 'admin')
  async create(@Body() createAuctionDto: CreateAuctionDto, @Req() req: any): Promise<IAuction> {
    const userId = String(req.user?.sub || '');
    return this.auctionsService.create(createAuctionDto, userId || undefined);
  }

  @Get('my-draft')
  @ApiOperation({ summary: 'Get current user draft auction (strict auth)' })
  @ApiOkResponse({ description: 'Draft retrieved' })
  @UseGuards(DualAuthGuard)
  async getMyDraft(@Req() req: any): Promise<IAuction | null> {
    const userId = String(req.user?.sub || '');
    return this.auctionsService.getMyDraft(userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get list of auctions' })
  @ApiOkResponse({ description: 'Auctions retrieved' })
  async findAll(
    @Query('status') status?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
    @Req() req?: any,
  ): Promise<PaginatedResponseDto<AuctionResponseDto>> {
    const query: GetAuctionsQueryDto = { status: status as GetAuctionsQueryDto['status'], page, limit };
    const requester = req?.user
      ? { userId: String(req.user?.sub || ''), roles: (req.user?.roles as Array<'user' | 'admin'>) ?? [] }
      : undefined;
    const result = await this.auctionsService.findAll(query, requester);
    return {
      ...result,
      data: result.data.map((item) => ({
        id: item._id,
        createdBy: item.createdBy ?? null,
        title: item.title,
        description: item.description,
        status: item.status,
        totalRounds: item.totalRounds,
        currentRound: item.currentRound,
        winnersPerRound: item.winnersPerRound,
        roundDuration: item.roundDuration,
        minBid: item.minBid,
        minIncrement: item.minIncrement,
        antiSnipingWindow: item.antiSnipingWindow,
        antiSnipingExtension: item.antiSnipingExtension,
        maxRoundExtensions: item.maxRoundExtensions,
        totalGiftsDistributed: item.totalGiftsDistributed,
        createdAt: item.createdAt,
        startedAt: item.startedAt,
        endedAt: item.endedAt,
      })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get auction by ID' })
  @ApiOkResponse({ description: 'Auction found' })
  async findById(@Param('id') id: string): Promise<IAuction | null> {
    return this.auctionsService.findById(id);
  }

  @Get(':id/rounds')
  @ApiOperation({ summary: 'Get auction rounds' })
  @ApiOkResponse({ description: 'Rounds retrieved' })
  async getRounds(@Param('id') id: string): Promise<IRound[]> {
    return this.auctionsService.getRounds(id);
  }

  @Get(':id/current-round')
  @ApiOperation({ summary: 'Get current round of auction' })
  @ApiOkResponse({ description: 'Current round found' })
  async getCurrentRound(@Param('id') id: string): Promise<IRound | null> {
    return this.auctionsService.getCurrentRound(id);
  }

  @Post(':id/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start an auction' })
  @ApiOkResponse({ description: 'Auction started' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('user', 'admin')
  async start(@Param('id') id: string): Promise<IAuction> {
    return this.auctionsService.start(id);
  }
}
