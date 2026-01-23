


export type CacheKey =
  | `auction:${string}`
  | `auction:${string}:current-round`
  | `auction:${string}:rounds`
  | `auction:${string}:supply`
  | `round:${string}`
  | `round:${string}:leaderboard`
  | `round:${string}:leaderboard:${number}`
  | `round:${string}:bids`
  | `round:${string}:top-bids`
  | `round:${string}:top-bids:${number}`
  | `user:${string}`
  | `user:${string}:balance`
  | `user:${string}:bids`
  | `auctions:active:list`
  | `auctions:active:count`
  | `lobby:${string}:${number}:${number}`;

// Cache TTL in seconds
export const CACHE_TTL = {
  AUCTION: 300, // 5 minutes - auction data changes rarely
  CURRENT_ROUND: 30, // 30 seconds - round data changes when extended (anti-sniping)
  ROUND: 300, // 5 minutes - completed rounds don't change
  LEADERBOARD: 10, // 10 seconds - leaderboard updates frequently
  TOP_BIDS: 5, // 5 seconds - top bids update on every bid
  USER_BALANCE: 5, // 5 seconds - balance updates frequently
  ACTIVE_AUCTIONS: 30, // 30 seconds
  USER: 300, // 5 minutes
  SUPPLY: 60, // 1 minute - supply changes on round completion
  LOBBY: 30, // 30 seconds - lobby snapshots
} as const;

// Cache value types
export interface CacheValue<T = string | number | boolean | object | null> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Distributed Lock types
export type LockKey =
  | `lock:round:${string}:complete`
  | `lock:auction:${string}:start`
  | `lock:user:${string}:bid`
  | `lock:balance:${string}:transaction`;

export interface LockOptions {
  ttl: number; // lock TTL in milliseconds
  retryDelay: number; // retry delay in milliseconds
  maxRetries: number;
}
