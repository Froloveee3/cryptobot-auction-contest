

import { ErrorDetails } from './error-details.types';


export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = 'DomainError';
    
    Object.setPrototypeOf(this, new.target.prototype);
  }
}


export class AuctionNotFoundError extends DomainError {
  constructor(auctionId: string) {
    super(`Auction ${auctionId} not found`, 'AUCTION_NOT_FOUND', 404, { auctionId });
    this.name = 'AuctionNotFoundError';
  }
}

/**
 * Round not found error
 */
export class RoundNotFoundError extends DomainError {
  constructor(roundId: string) {
    super(`Round ${roundId} not found`, 'ROUND_NOT_FOUND', 404, { roundId });
    this.name = 'RoundNotFoundError';
  }
}

/**
 * No active round error
 */
export class NoActiveRoundError extends DomainError {
  constructor(auctionId: string) {
    super('No active round found', 'NO_ACTIVE_ROUND', 400, { auctionId });
    this.name = 'NoActiveRoundError';
  }
}

/**
 * Round has ended error
 */
export class RoundEndedError extends DomainError {
  constructor(roundId?: string) {
    super('Round has ended', 'ROUND_ENDED', 400, roundId ? { roundId } : undefined);
    this.name = 'RoundEndedError';
  }
}

/**
 * Insufficient balance error
 */
export class InsufficientBalanceError extends DomainError {
  constructor(userId: string, required: number, available: number) {
    super('Insufficient balance', 'INSUFFICIENT_BALANCE', 400, {
      userId,
      required,
      available,
    });
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Bid too low error
 */
export class BidTooLowError extends DomainError {
  constructor(amount: number, minBid: number) {
    super(`Bid amount must be at least ${minBid}`, 'BID_TOO_LOW', 400, {
      amount,
      minBid,
    });
    this.name = 'BidTooLowError';
  }
}

/**
 * Bid increment too low error
 */
export class BidIncrementTooLowError extends DomainError {
  constructor(amount: number, minIncrement: number) {
    super(
      `To increase your bid, you must add at least ${minIncrement}`,
      'BID_INCREMENT_TOO_LOW',
      400,
      {
        amount,
        minIncrement,
      },
    );
    this.name = 'BidIncrementTooLowError';
  }
}

/**
 * Raise requested but there is no in-play bid to raise in current round
 */
export class NoActiveBidToRaiseError extends DomainError {
  constructor(auctionId: string) {
    super('No active bid to raise in current round', 'NO_ACTIVE_BID_TO_RAISE', 400, { auctionId });
    this.name = 'NoActiveBidToRaiseError';
  }
}

/**
 * New bid requested but user already has an active bid in the auction
 */
export class NewBidNotAllowedWhenActiveExistsError extends DomainError {
  constructor(auctionId: string) {
    super('New bid is not allowed when an active bid already exists', 'NEW_BID_NOT_ALLOWED_WHEN_ACTIVE_EXISTS', 400, {
      auctionId,
    });
    this.name = 'NewBidNotAllowedWhenActiveExistsError';
  }
}

/**
 * Write conflict error (retryable)
 */
export class WriteConflictError extends DomainError {
  constructor() {
    super('Write conflict, please retry', 'WRITE_CONFLICT', 409);
    this.name = 'WriteConflictError';
  }
}

/**
 * Auction is overloaded (load shedding)
 */
export class AuctionBusyError extends DomainError {
  constructor(auctionId: string, details?: ErrorDetails) {
    const base: Record<string, any> = { auctionId };
    if (details && typeof details === 'object' && !Array.isArray(details)) {
      Object.assign(base, details as any);
    } else if (details !== undefined) {
      base.detail = details as any;
    }
    super('Auction is busy, please retry', 'AUCTION_BUSY', 429, base);
    this.name = 'AuctionBusyError';
  }
}

/**
 * Invalid auction state error
 */
export class InvalidAuctionStateError extends DomainError {
  constructor(currentStatus: string, expectedStatus?: string) {
    super(
      `Auction can only be started when in draft status, current: ${currentStatus}`,
      'INVALID_AUCTION_STATE',
      400,
      { currentStatus, expectedStatus },
    );
    this.name = 'InvalidAuctionStateError';
  }
}
