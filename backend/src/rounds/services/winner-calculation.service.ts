import { Injectable } from '@nestjs/common';
import { IAuction } from '../../common/types/entities.types';

export interface BidData {
  _id: string;
  userId: string;
  amount: number;
  timestamp: Date;
  recipientUserId: string;
}

export interface WinnerInfo {
  bidId: string;
  giftNumber: number;
  userId: string;
  recipientUserId: string;
}

export interface LoserInfo {
  bidId: string;
  userId: string;
}

export interface RoundCompletionResult {
  winners: WinnerInfo[];
  losersToRefundNow: LoserInfo[];
  totalGiftsAfterRound: number;
  isAuctionComplete: boolean;
}


@Injectable()
export class WinnerCalculationService {
  
  calculateRoundCompletion(
    bids: BidData[],
    auction: IAuction,
    roundNumber: number,
    winnersCountThisRound: number,
  ): RoundCompletionResult {
    
    const totalSupply = auction.totalRounds * auction.winnersPerRound;
    const remainingBeforeRound = Math.max(0, totalSupply - (auction.totalGiftsDistributed ?? 0));

    
    
    const burnedThisRound = Math.min(winnersCountThisRound, remainingBeforeRound);
    const actualWinners = Math.min(burnedThisRound, bids.length);

    const winners = bids.slice(0, actualWinners);
    const losersAll = bids.slice(actualWinners); 

    
    const winnersToUpdate: WinnerInfo[] = winners.map((bid, index) => ({
      bidId: bid._id,
      giftNumber: (auction.totalGiftsDistributed ?? 0) + index + 1,
      userId: bid.userId,
      recipientUserId: bid.recipientUserId,
    }));

    const totalGiftsAfterRound = (auction.totalGiftsDistributed ?? 0) + burnedThisRound;
    const isLastRound = roundNumber >= auction.totalRounds;
    const isAuctionComplete = isLastRound || totalGiftsAfterRound >= totalSupply;

    
    if (isAuctionComplete) {
      const allLosers: LoserInfo[] = losersAll.map((bid) => ({ bidId: bid._id, userId: bid.userId }));
      return {
        winners: winnersToUpdate,
        losersToRefundNow: allLosers,
        totalGiftsAfterRound,
        isAuctionComplete: true,
      };
    }

    
    
    const remainingAfterRound = Math.max(0, totalSupply - totalGiftsAfterRound);
    const toRefund = losersAll.slice(remainingAfterRound);
    const losersToRefundNow: LoserInfo[] = toRefund.map((bid) => ({ bidId: bid._id, userId: bid.userId }));

    return {
      winners: winnersToUpdate,
      losersToRefundNow,
      totalGiftsAfterRound,
      isAuctionComplete: false,
    };
  }
}