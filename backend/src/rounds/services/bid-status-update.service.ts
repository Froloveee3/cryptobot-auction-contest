import { Injectable } from '@nestjs/common';
import { Types, ClientSession } from 'mongoose';
import { BalanceService } from '../../balance/balance.service';
import { BidRepository } from '../../common/repositories/bid.repository';

export interface WinnerInfo {
  bidId: string;
  giftNumber: number;
  userId: string;
  recipientUserId: string;
  wonRoundNumber: number;
}

export interface LoserInfo {
  bidId: string;
  userId: string;
}

export interface BidAmountMap {
  [bidId: string]: number;
}


@Injectable()
export class BidStatusUpdateService {
  constructor(
    private bidRepository: BidRepository,
    private balanceService: BalanceService,
  ) {}

  
  async updateWinners(
    winners: WinnerInfo[],
    bidAmounts: BidAmountMap,
    session?: ClientSession,
  ): Promise<void> {
    if (winners.length === 0) return;

    
    const winnerOps = winners.map((winner) => ({
      updateOne: {
        filter: {
          _id: new Types.ObjectId(winner.bidId),
          status: 'active' as const,
        },
        update: {
          $set: {
            status: 'won' as const,
            giftNumber: winner.giftNumber,
            wonRoundNumber: winner.wonRoundNumber,
          },
        },
      },
    }));

    
    if (winnerOps.length > 0) {
      await this.bidRepository.getModel().bulkWrite(winnerOps, session ? { session } : {});
    }

    
    const chargePromises = winners.map((winner) => {
      const amount = bidAmounts[winner.bidId];
      if (amount !== undefined) {
        return this.balanceService.charge(winner.userId, amount, winner.bidId, session);
      }
      return Promise.resolve();
    });

    await Promise.all(chargePromises);
  }

  
  async refundLosers(
    losers: LoserInfo[],
    bidAmounts: BidAmountMap,
    session?: ClientSession,
  ): Promise<void> {
    if (losers.length === 0) return;

    
    const refundOps = losers
      .filter((loser) => bidAmounts[loser.bidId] !== undefined)
      .map((loser) => ({
        updateOne: {
          filter: {
            _id: new Types.ObjectId(loser.bidId),
            status: 'active' as const,
          },
          update: { $set: { status: 'refunded' as const } },
        },
      }));

    
    if (refundOps.length > 0) {
      
      
      await this.bidRepository.getModel().bulkWrite(refundOps, session ? { session } : {});
    }

    
    const refundPromises = losers.map((loser) => {
      const amount = bidAmounts[loser.bidId];
      if (amount !== undefined) {
        return this.balanceService.refund(loser.userId, amount, loser.bidId, session);
      }
      return Promise.resolve();
    });

    await Promise.all(refundPromises);
  }
}