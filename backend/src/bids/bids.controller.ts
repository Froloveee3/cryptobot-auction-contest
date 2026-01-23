import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, Req, UseGuards, HttpCode } from '@nestjs/common';
import { ApiAcceptedResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BidsService } from './bids.service';
import { BidIntakeService } from './bid-intake.service';
import {
  PlaceBidDto,
  GetBidsQueryDto,
  BidResponseDto,
  PaginatedResponseDto,
} from '../common/types/dto.types';
import { IBid } from '../common/types/entities.types';
import { DualAuthGuard } from '../auth/dual-auth.guard';
import { RateLimit } from '../common/guards/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@ApiTags('bids')
@Controller('auctions/:auctionId/bids')
export class BidsController {
  constructor(
    private readonly bidsService: BidsService,
    private readonly intake: BidIntakeService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Place a bid' })
  @ApiCreatedResponse({ description: 'Bid placed successfully' })
  @UseGuards(DualAuthGuard, RateLimitGuard)
  @RateLimit({ key: 'place_bid', windowSec: 10, max: 20 })
  async placeBid(
    @Param('auctionId') auctionId: string,
    @Body() placeBidDto: PlaceBidDto,
    @Req() req: any,
  ): Promise<IBid> {
    const userId = String(req.user?.sub || '');
    const idemKey = (req.headers?.['idempotency-key'] || req.headers?.['Idempotency-Key']) as string | undefined;
    return this.bidsService.placeBid(userId, auctionId, placeBidDto, { idempotencyKey: idemKey });
  }

  @Post('intake')
  @HttpCode(202)
  @ApiOperation({ summary: 'Place a bid via async intake (queue)' })
  @ApiAcceptedResponse({ description: 'Bid accepted for processing (async)' })
  @UseGuards(DualAuthGuard, RateLimitGuard)
  @RateLimit({ key: 'place_bid_intake', windowSec: 10, max: 200 })
  async placeBidIntake(
    @Param('auctionId') auctionId: string,
    @Body() placeBidDto: PlaceBidDto,
    @Req() req: any,
  ): Promise<{ accepted: true; intakeId: string }> {
    const userId = String(req.user?.sub || '');
    const idemKey = (req.headers?.['idempotency-key'] || req.headers?.['Idempotency-Key']) as string | undefined;
    const requestId = (req.headers?.['x-request-id'] || req.headers?.['X-Request-Id']) as string | undefined;
    const { intakeId } = await this.intake.enqueue({ userId, auctionId, dto: placeBidDto, idempotencyKey: idemKey, requestId });
    return { accepted: true, intakeId };
  }

  @Get()
  @ApiOperation({ summary: 'Get bids for an auction' })
  @ApiOkResponse({ description: 'Bids retrieved' })
  async findByAuction(
    @Param('auctionId') auctionId: string,
    @Query('userId') userId?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ): Promise<PaginatedResponseDto<BidResponseDto>> {
    const query: GetBidsQueryDto = { userId, page, limit };
    const result = await this.bidsService.findByAuction(auctionId, query);
    return {
      ...result,
      data: result.data.map((item) => ({
        id: item._id,
        auctionId: item.auctionId,
        userId: item.userId,
        amount: item.amount,
        status: item.status,
        timestamp: item.timestamp,
        giftNumber: item.giftNumber ?? null,
        wonRoundNumber: item.wonRoundNumber ?? null,
        recipientUserId: item.recipientUserId ?? null,
        createdAt: item.createdAt || item.timestamp,
      })),
    };
  }
}
