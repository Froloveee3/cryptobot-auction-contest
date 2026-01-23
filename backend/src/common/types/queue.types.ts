


export type JobName = 'complete-round' | 'start-round' | 'start-auction';


export function getCompleteRoundJobId(roundId: string): string {
  
  
  return `complete-round__${roundId}`;
}

// Complete Round Job
export interface CompleteRoundJobData {
  roundId: string;
  auctionId: string;
}

export interface CompleteRoundJobResult {
  roundId: string;
  winners: string[];
  losers: string[];
  nextRoundCreated: boolean;
}

// Start Round Job
export interface StartRoundJobData {
  roundId: string;
  auctionId: string;
  roundNumber: number;
}

export interface StartRoundJobResult {
  roundId: string;
  started: boolean;
}

// Start Auction Job
export interface StartAuctionJobData {
  auctionId: string;
}

export interface StartAuctionJobResult {
  auctionId: string;
  firstRoundId: string;
  started: boolean;
}

// Job Options
export interface JobOptions {
  delay?: number; // delay in milliseconds
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  priority?: number;
}
