import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Bot } from './schemas/bot.schema';
import { BidsService } from '../bids/bids.service';
import { AuctionsService } from '../auctions/auctions.service';
import { UsersService } from '../users/users.service';
import { IAuction } from '../common/types/entities.types';
import { toPlainObject } from '../common/utils/mongoose.helper';

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

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);
  private activeBots: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    @InjectModel(Bot.name) private botModel: Model<Bot>,
    private bidsService: BidsService,
    private auctionsService: AuctionsService,
    private usersService: UsersService,
  ) {}

  async create(data: CreateBotDto) {
    
    const u = await this.usersService.findById(String(data.userId || ''));
    if (!u) {
      throw new BadRequestException({ code: 'BOT_USER_NOT_FOUND', message: 'Bot user not found' });
    }
    if (!String(u.username || '').startsWith('_bot')) {
      throw new BadRequestException({
        code: 'BOT_USERNAME_PREFIX_REQUIRED',
        message: 'Bot user username must start with _bot',
      });
    }

    const bot = new this.botModel({
      name: data.name,
      type: data.type,
      userId: data.userId,
      auctionId: data.auctionId ?? null,
      isActive: false,
      minAmount: data.minAmount ?? 1000,
      maxAmount: data.maxAmount ?? 10000,
      minInterval: data.minInterval ?? 5000,
      maxInterval: data.maxInterval ?? 30000,
      totalBids: 0,
      lastBidAt: null,
    });
    const saved = await bot.save();
    return toPlainObject(saved);
  }

  async findAll(auctionId?: string) {
    const filter: { auctionId?: string | null; $or?: Array<{ auctionId: string | null }> } = {};
    if (auctionId) {
      filter.$or = [{ auctionId }, { auctionId: null }];
    }
    const bots = await this.botModel.find(filter).lean().exec();
    return bots.map((bot) => ({
      ...bot,
      _id: bot._id.toString(),
    }));
  }

  async findById(id: string) {
    const bot = await this.botModel.findById(id).lean().exec();
    if (!bot) {
      return null;
    }
    return {
      ...bot,
      _id: bot._id.toString(),
    };
  }

  async start(id: string) {
    const bot = await this.botModel.findById(id);
    if (!bot) {
      throw new Error('Bot not found');
    }

    if (bot.isActive) {
      return toPlainObject(bot);
    }

    bot.isActive = true;
    await bot.save();

    
    this.startBotActivity(bot._id.toString());

    return toPlainObject(bot);
  }

  async stop(id: string) {
    const bot = await this.botModel.findById(id);
    if (!bot) {
      throw new Error('Bot not found');
    }

    if (!bot.isActive) {
      return toPlainObject(bot);
    }

    bot.isActive = false;
    await bot.save();

    
    this.stopBotActivity(bot._id.toString());

    return toPlainObject(bot);
  }

  private startBotActivity(botId: string) {
    
    this.stopBotActivity(botId);

    const interval = setInterval(async () => {
      try {
        await this.makeBotBid(botId);
      } catch (error) {
        this.logger.error(`Error in bot ${botId}: ${error}`);
      }
    }, 1000); // Check every second

    this.activeBots.set(botId, interval);
  }

  private stopBotActivity(botId: string) {
    const interval = this.activeBots.get(botId);
    if (interval) {
      clearInterval(interval);
      this.activeBots.delete(botId);
    }
  }

  private async makeBotBid(botId: string) {
    const bot = await this.botModel.findById(botId);
    if (!bot || !bot.isActive) {
      this.stopBotActivity(botId);
      return;
    }

    // Check if enough time has passed since last bid
    const now = Date.now();
    if (bot.lastBidAt) {
      const timeSinceLastBid = now - bot.lastBidAt.getTime();
      const nextBidTime = this.getNextBidInterval(bot);
      if (timeSinceLastBid < nextBidTime) {
        return; // Too soon
      }
    }

    // Get active auctions
    const auctions = await this.auctionsService.findAll({ status: 'active', page: 1, limit: 100 });
    if (auctions.data.length === 0) {
      return; // No active auctions
    }

    // Filter auctions for this bot
    const targetAuctions = auctions.data.filter(
      (auction) => !bot.auctionId || auction._id === bot.auctionId,
    );
    if (targetAuctions.length === 0) {
      return; // No matching auctions
    }

    // Select auction based on bot type
    const auction = await this.selectAuction(bot, targetAuctions);

    // For sniper bots: check if it's time to bid (last seconds of round)
    if (bot.type === 'sniper') {
      const shouldBid = await this.shouldSniperBid(auction);
      if (!shouldBid) {
        return; // Not time yet
      }
    }

    // Check user balance
    const balance = await this.usersService.getBalance(bot.userId);
    if (balance < auction.minBid) {
      return; // Insufficient balance
    }

    // Calculate bid amount based on bot type
    const bidAmount = this.calculateBidAmount(bot, auction);

    if (bidAmount > balance) {
      return; // Not enough balance
    }

    try {
      // Place bid
      await this.bidsService.placeBid(bot.userId, auction._id, { amount: bidAmount });

      // Update bot stats
      bot.totalBids += 1;
      bot.lastBidAt = new Date();
      await bot.save();

      this.logger.log(`Bot ${bot.name} placed bid ${bidAmount} on auction ${auction._id}`);
    } catch (error) {
      this.logger.error(`Bot ${bot.name} failed to place bid: ${error}`);
    }
  }

  private async selectAuction(bot: Bot, auctions: any[]): Promise<any> {
    // For sniper bots, prefer auctions closer to end
    if (bot.type === 'sniper') {
      // Sort by time remaining (ascending - closest to end first)
      const auctionPromises = auctions.map(async (auction) => {
        const round = await this.auctionsService.getCurrentRound(auction._id);
        if (!round) return null;
        const endTime = round.extendedEndTime ?? round.endTime;
        const timeRemaining = endTime.getTime() - Date.now();
        return { auction, timeRemaining };
      });

      const results = await Promise.all(auctionPromises);
      const sorted = results
        .filter((item): item is { auction: IAuction; timeRemaining: number } => 
          item !== null && item.timeRemaining > 0
        )
        .sort((a, b) => a.timeRemaining - b.timeRemaining);

      if (sorted.length > 0 && sorted[0]) {
        return sorted[0].auction;
      }
    }

    // For other bots, random selection
    return auctions[Math.floor(Math.random() * auctions.length)];
  }

  private async shouldSniperBid(auction: any): Promise<boolean> {
    const round = await this.auctionsService.getCurrentRound(auction._id);
    if (!round) return false;

    const endTime = round.extendedEndTime ?? round.endTime;
    const timeRemaining = endTime.getTime() - Date.now();
    const secondsRemaining = timeRemaining / 1000;

    // Sniper bots bid in the last 10 seconds
    return secondsRemaining <= 10 && secondsRemaining > 0;
  }

  private getNextBidInterval(bot: Bot): number {
    // Different intervals based on bot type
    switch (bot.type) {
      case 'aggressive':
        return bot.minInterval; // Fast - minimum interval
      case 'sniper':
        // Check more frequently when close to round end
        return 1000; // Check every second
      case 'strategic':
        return (bot.minInterval + bot.maxInterval) / 2; // Medium
      default: // simple
        return bot.minInterval + Math.random() * (bot.maxInterval - bot.minInterval);
    }
  }

  private calculateBidAmount(bot: Bot, auction: any): number {
    const min = Math.max(bot.minAmount, auction.minBid);
    const max = Math.min(bot.maxAmount, auction.minBid * 100); // Reasonable max

    switch (bot.type) {
      case 'aggressive':
        // Higher bids, closer to max
        return Math.round(min + Math.random() * (max - min) * 0.8);
      case 'sniper':
        // For sniper: bid higher to ensure top position in last seconds
        // But still within bot's maxAmount
        return Math.round(min + Math.random() * (max - min) * 0.7);
      case 'strategic':
        // Variable strategy - sometimes high, sometimes low
        const strategy = Math.random();
        if (strategy > 0.7) {
          // 30% chance of high bid
          return Math.round(min + Math.random() * (max - min) * 0.8);
        } else {
          // 70% chance of medium bid
          return Math.round(min + Math.random() * (max - min) * 0.5);
        }
      default: // simple
        return Math.round(min + Math.random() * (max - min));
    }
  }
}
