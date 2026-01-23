export type BotBidJobData = {
  auctionId: string;
  roundId: string;
  roundNumber: number;
  
  roundDurationSec?: number;
  antiSnipingWindowSec?: number;
  winnersPerRound?: number;
  minBid?: number;
  minIncrement?: number;
};

