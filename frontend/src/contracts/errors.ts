

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  error: string; 
  code?: string; 
  details?: unknown; 
  timestamp?: string;
  path?: string;
}


export type ApiErrorCode =
  | 'USERNAME_REQUIRED'
  | 'PASSWORD_TOO_SHORT'
  | 'USERNAME_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'BID_TOO_LOW'
  | 'INSUFFICIENT_BALANCE'
  | 'AUCTION_NOT_FOUND'
  | 'ROUND_ENDED'
  | 'NO_ACTIVE_ROUND'
  | 'NEW_BID_NOT_ALLOWED_WHEN_ACTIVE_EXISTS'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INTERNAL_SERVER_ERROR';


export function hasErrorCode(error: ApiErrorBody, code: ApiErrorCode): boolean {
  return error.code === code;
}


export function getErrorMessage(error: ApiErrorBody): string {
  
  if (error.code) {
    const messages: Record<string, string> = {
      USERNAME_REQUIRED: 'Username is required',
      PASSWORD_TOO_SHORT: 'Password is too short (minimum 6 characters)',
      USERNAME_EXISTS: 'Username already exists',
      INVALID_CREDENTIALS: 'Invalid username or password',
      BID_TOO_LOW: 'Bid amount is too low',
      INSUFFICIENT_BALANCE: 'Insufficient balance',
      AUCTION_NOT_FOUND: 'Auction not found',
      ROUND_ENDED: 'Round has ended',
      NO_ACTIVE_ROUND: 'No active round available',
      NEW_BID_NOT_ALLOWED_WHEN_ACTIVE_EXISTS: 'You already have an active bid. Use "raise" mode to increase it.',
    };
    return messages[error.code] || error.message;
  }
  return error.message || 'An error occurred';
}
