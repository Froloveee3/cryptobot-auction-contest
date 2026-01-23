import { Injectable, Logger } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { WinnerCalculationService, BidData } from './winner-calculation.service';
import { BidStatusUpdateService, BidAmountMap } from './bid-status-update.service';
import { getRoundParams } from '../../common/utils/schedule.helper';
import { IAuction } from '../../common/types/entities.types';
import { RoundRepository } from '../../common/repositories/round.repository';
import { AuctionRepository } from '../../common/repositories/auction.repository';
import { BidRepository } from '../../common/repositories/bid.repository';

export interface RoundCompletionData {
  roundId: string;
  roundNumber: number;
  winners: Array<{ userId: string; amount: number; giftNumber: number | null; recipientUserId: string }>;
}

export interface AuctionCompletionData {
  status: 'completed';
  endedAt: Date;
  auction: IAuction;
}

export interface NextRoundData {
  roundId: string;
  roundNumber: number;
  duration: number; 
  startTime: Date;
  endTime: Date;
}


@Injectable()
export class RoundCompletionOrchestrator {
  private readonly logger = new Logger(RoundCompletionOrchestrator.name);

  constructor(
    private roundRepository: RoundRepository,
    private auctionRepository: AuctionRepository,
    private bidRepository: BidRepository,
    private winnerCalculationService: WinnerCalculationService,
    private bidStatusUpdateService: BidStatusUpdateService,
  ) {}

  
  async completeRound(
    roundId: string,
    auctionId: string,
    session: ClientSession,
  ): Promise<{
    roundEnded: RoundCompletionData;
    auctionUpdated?: AuctionCompletionData;
    nextRound?: NextRoundData;
  } | null> {
    
    const roundDoc = await this.roundRepository.getModel().findById(roundId).session(session).exec();
    if (!roundDoc) {
      throw new Error(`Round ${roundId} not found`);
    }

    if (roundDoc.status === 'completed') {
      this.logger.warn(`Round ${roundId} already completed`);
      return null;
    }

    const auctionDoc = await this.auctionRepository.getModel().findById(auctionId).session(session).exec();
    if (!auctionDoc) {
      throw new Error(`Auction ${auctionId} not found`);
    }

    const auctionForParams = {
      ...auctionDoc.toObject(),
      _id: auctionDoc._id.toString(),
    } as IAuction;

    // Step 2: Load active bids for the auction (auction-level bids; losers remain active across rounds)
    const allBidsDocs = await this.bidRepository
      .getModel()
      .find({ auctionId, status: 'active' })
      .select('_id userId amount timestamp recipientUserId')
      .session(session)
      .sort({ amount: -1, timestamp: 1 })
      .lean()
      .exec();

    const allBids: BidData[] = allBidsDocs.map((bid: any) => ({
      _id: String(bid._id),
      userId: bid.userId.toString(),
      amount: bid.amount,
      timestamp: bid.timestamp,
      recipientUserId: bid.recipientUserId?.toString() || bid.userId.toString(),
    }));

    this.logger.log(`Found ${allBids.length} active bids in auction ${auctionId} for round ${roundId}`);

    // Step 3: Calculate winners using domain service
    const calculationResult = this.winnerCalculationService.calculateRoundCompletion(
      allBids,
      auctionForParams,
      roundDoc.roundNumber,
      roundDoc.winnersCount || auctionForParams.winnersPerRound,
    );

    this.logger.log(
      `Winners: ${calculationResult.winners.length}, ` +
        `Refund: ${calculationResult.losersToRefundNow.length}`,
    );

    // Build bid amounts map for balance operations
    const bidAmounts: BidAmountMap = {};
    allBidsDocs.forEach((bid) => {
      bidAmounts[String(bid._id)] = bid.amount;
    });

    // Step 4: Update winner bids and charge balances
    await this.bidStatusUpdateService.updateWinners(
      calculationResult.winners.map((w) => ({ ...w, wonRoundNumber: roundDoc.roundNumber })),
      bidAmounts,
      session,
    );

    // Step 5: Handle losers (refund impossible ones now; the rest remain active for future rounds)
    let nextRoundInfo: NextRoundData | undefined;
    
    if (calculationResult.isAuctionComplete) {
      // Final round or all gifts distributed - refund all losers
      await this.bidStatusUpdateService.refundLosers(
        calculationResult.losersToRefundNow,
        bidAmounts,
        session,
      );

      // Mark auction as completed
      auctionDoc.status = 'completed';
      auctionDoc.endedAt = new Date();
    } else {
      // Refund impossible ones now (supply cutoff after burning this round)
      await this.bidStatusUpdateService.refundLosers(
        calculationResult.losersToRefundNow,
        bidAmounts,
        session,
      );

      // Create next round
      const nextRoundNumber = roundDoc.roundNumber + 1;
      const roundParams = getRoundParams(auctionForParams, nextRoundNumber);
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + roundParams.duration * 1000);

      const nextRoundDocs = await this.roundRepository.getModel().create(
        [
          {
            auctionId,
            roundNumber: nextRoundNumber,
            status: 'active',
            startTime,
            endTime,
            extendedEndTime: null,
            extensionCount: 0,
            winnersCount: roundParams.winnersPerRound,
            roundDuration: roundParams.duration,
            antiSnipingWindow: roundParams.antiSnipingWindow,
            antiSnipingExtension: roundParams.antiSnipingExtension,
            maxRoundExtensions: roundParams.maxRoundExtensions,
            participants: [],
            winners: [],
            completedAt: null,
            lastBidAt: null,
          },
        ],
        { session },
      );

      if (!nextRoundDocs || nextRoundDocs.length === 0) {
        throw new Error(`Failed to create next round ${nextRoundNumber} for auction ${auctionId}`);
      }

      const nextRoundDoc = nextRoundDocs[0];
      if (!nextRoundDoc) {
        throw new Error(`Failed to create next round ${nextRoundNumber} for auction ${auctionId}`);
      }
      const nextRoundId = nextRoundDoc._id.toString();

      auctionDoc.currentRound = nextRoundNumber;
      
      // Store nextRound info for return
      nextRoundInfo = {
        roundId: nextRoundId,
        roundNumber: nextRoundNumber,
        duration: roundParams.duration,
        startTime,
        endTime,
      };
    }

    // Step 6: Update round and auction status
    auctionDoc.totalGiftsDistributed = calculationResult.totalGiftsAfterRound;
    await auctionDoc.save({ session });

    roundDoc.status = 'completed';
    roundDoc.completedAt = new Date();
    roundDoc.winners = calculationResult.winners.map((w) => w.userId);
    await roundDoc.save({ session });

    // Build response data
    const roundEnded: RoundCompletionData = {
      roundId: roundDoc._id.toString(),
      roundNumber: roundDoc.roundNumber,
      winners: calculationResult.winners.map((w) => {
        const amount = bidAmounts[w.bidId] || 0;
        return {
          userId: w.userId,
          amount,
          giftNumber: w.giftNumber,
          recipientUserId: w.recipientUserId,
        };
      }),
    };

    const auctionUpdated: AuctionCompletionData | undefined = calculationResult.isAuctionComplete
      ? {
          status: 'completed',
          endedAt: auctionDoc.endedAt!,
          auction: {
            ...(auctionDoc.toObject() as IAuction),
            _id: auctionDoc._id.toString(),
          },
        }
      : undefined;

    const nextRound: NextRoundData | undefined = nextRoundInfo;

    return {
      roundEnded,
      auctionUpdated,
      nextRound,
    };
  }

  /**
   * Complete round without transaction (fallback for standalone MongoDB)
   * Same logic as completeRound but without session
   */
  async completeRoundWithoutTransaction(
    roundId: string,
    auctionId: string,
  ): Promise<{
    roundEnded: RoundCompletionData;
    auctionUpdated?: AuctionCompletionData;
    nextRound?: NextRoundData;
  } | null> {
    // Step 1: Load round and auction (without transaction)
    const roundDoc = await this.roundRepository.getModel().findById(roundId).exec();
    if (!roundDoc) {
      throw new Error(`Round ${roundId} not found`);
    }

    if (roundDoc.status === 'completed') {
      this.logger.warn(`Round ${roundId} already completed`);
      return null;
    }

    const auctionDoc = await this.auctionRepository.getModel().findById(auctionId).exec();
    if (!auctionDoc) {
      throw new Error(`Auction ${auctionId} not found`);
    }

    const auctionForParams = {
      ...auctionDoc.toObject(),
      _id: auctionDoc._id.toString(),
    } as IAuction;

    // Step 2: Load active bids for the auction (auction-level bids)
    const allBidsData = await this.bidRepository.findActiveByAuctionId(auctionId);
    const allBids: BidData[] = allBidsData.map((bid: any) => ({
      _id: bid._id,
      userId: bid.userId,
      amount: bid.amount,
      timestamp: bid.timestamp,
      recipientUserId: bid.recipientUserId || bid.userId,
    }));

    this.logger.log(`Found ${allBids.length} active bids in auction ${auctionId} for round ${roundId}`);

    // Step 3: Calculate winners using domain service
    const calculationResult = this.winnerCalculationService.calculateRoundCompletion(
      allBids,
      auctionForParams,
      roundDoc.roundNumber,
      roundDoc.winnersCount || auctionForParams.winnersPerRound,
    );

    this.logger.log(
      `Winners: ${calculationResult.winners.length}, Refund: ${calculationResult.losersToRefundNow.length}`,
    );

    // Build bid amounts map for balance operations
    const bidAmounts: BidAmountMap = {};
    allBidsData.forEach((bid) => {
      bidAmounts[bid._id] = bid.amount;
    });

    // Step 4: Update winner bids and charge balances (without session)
    await this.bidStatusUpdateService.updateWinners(
      calculationResult.winners.map((w) => ({ ...w, wonRoundNumber: roundDoc.roundNumber })),
      bidAmounts,
      undefined, // No session
    );

    // Step 5: Handle losers (transfer or refund)
    let nextRoundInfo: NextRoundData | undefined;
    
    if (calculationResult.isAuctionComplete) {
      // Final round or all gifts distributed - refund all losers
      await this.bidStatusUpdateService.refundLosers(
        calculationResult.losersToRefundNow,
        bidAmounts,
        undefined, // No session
      );

      // Mark auction as completed
      auctionDoc.status = 'completed';
      auctionDoc.endedAt = new Date();
    } else {
      // Refund impossible ones now (supply cutoff after burning this round)
      await this.bidStatusUpdateService.refundLosers(
        calculationResult.losersToRefundNow,
        bidAmounts,
        undefined, // No session
      );

      // Create next round
      const nextRoundNumber = roundDoc.roundNumber + 1;
      const roundParams = getRoundParams(auctionForParams, nextRoundNumber);
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + roundParams.duration * 1000);

      const nextRoundDoc = new (this.roundRepository.getModel())({
        auctionId,
        roundNumber: nextRoundNumber,
        status: 'active',
        startTime,
        endTime,
        extendedEndTime: null,
        extensionCount: 0,
        winnersCount: roundParams.winnersPerRound,
        roundDuration: roundParams.duration,
        antiSnipingWindow: roundParams.antiSnipingWindow,
        antiSnipingExtension: roundParams.antiSnipingExtension,
        maxRoundExtensions: roundParams.maxRoundExtensions,
        participants: [],
        winners: [],
        completedAt: null,
        lastBidAt: null,
      });
      await nextRoundDoc.save();
      const nextRoundId = nextRoundDoc._id.toString();

      auctionDoc.currentRound = nextRoundNumber;
      
      // Store nextRound info for return
      nextRoundInfo = {
        roundId: nextRoundId,
        roundNumber: nextRoundNumber,
        duration: roundParams.duration,
        startTime,
        endTime,
      };
    }

    // Step 6: Update round and auction status
    auctionDoc.totalGiftsDistributed = calculationResult.totalGiftsAfterRound;
    await auctionDoc.save();

    roundDoc.status = 'completed';
    roundDoc.completedAt = new Date();
    roundDoc.winners = calculationResult.winners.map((w) => w.userId);
    await roundDoc.save();

    // Build response data
    const roundEnded: RoundCompletionData = {
      roundId: roundDoc._id.toString(),
      roundNumber: roundDoc.roundNumber,
      winners: calculationResult.winners.map((w) => {
        const amount = bidAmounts[w.bidId] || 0;
        return {
          userId: w.userId,
          amount,
          giftNumber: w.giftNumber,
          recipientUserId: w.recipientUserId,
        };
      }),
    };

    const auctionUpdated: AuctionCompletionData | undefined = calculationResult.isAuctionComplete
      ? {
          status: 'completed',
          endedAt: auctionDoc.endedAt!,
          auction: {
            ...(auctionDoc.toObject() as IAuction),
            _id: auctionDoc._id.toString(),
          },
        }
      : undefined;

    const nextRound: NextRoundData | undefined = nextRoundInfo;

    return {
      roundEnded,
      auctionUpdated,
      nextRound,
    };
  }
}