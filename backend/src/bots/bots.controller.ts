import { Controller, Get, Post, Body, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BotsService } from './bots.service';
import { DualAuthGuard } from '../auth/dual-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

interface CreateBotDto {
  name: string;
  type: 'simple' | 'aggressive' | 'sniper' | 'strategic';
  userId: string;
  auctionId?: string | null;
  minAmount?: number;
  maxAmount?: number;
  minInterval?: number;
  maxInterval?: number;
}

@ApiTags('bots')
@Controller('bots')
@UseGuards(DualAuthGuard, RolesGuard)
@Roles('admin')
export class BotsController {
  constructor(private readonly botsService: BotsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new bot' })
  @ApiCreatedResponse({ description: 'Bot created successfully' })
  async create(@Body() createBotDto: CreateBotDto) {
    return this.botsService.create(createBotDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get list of bots' })
  @ApiOkResponse({ description: 'Bots retrieved' })
  async findAll(@Query('auctionId') auctionId?: string) {
    return this.botsService.findAll(auctionId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bot by ID' })
  @ApiOkResponse({ description: 'Bot found' })
  async findById(@Param('id') id: string) {
    return this.botsService.findById(id);
  }

  @Post(':id/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start a bot' })
  @ApiOkResponse({ description: 'Bot started' })
  async start(@Param('id') id: string) {
    return this.botsService.start(id);
  }

  @Post(':id/stop')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stop a bot' })
  @ApiOkResponse({ description: 'Bot stopped' })
  async stop(@Param('id') id: string) {
    return this.botsService.stop(id);
  }
}
