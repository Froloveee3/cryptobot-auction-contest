

import { IAuction } from '../types/entities.types';

export interface RoundParams {
  duration: number;
  antiSnipingWindow: number;
  antiSnipingExtension: number;
  maxRoundExtensions: number;
  winnersPerRound: number;
}


export function getRoundParams(auction: IAuction, roundNumber: number): RoundParams {
  
  if (!auction.schedule || auction.schedule.length === 0) {
    return {
      duration: auction.roundDuration,
      antiSnipingWindow: auction.antiSnipingWindow,
      antiSnipingExtension: auction.antiSnipingExtension,
      maxRoundExtensions: auction.maxRoundExtensions,
      winnersPerRound: auction.winnersPerRound,
    };
  }

  
  const rule = auction.schedule.find(
    (r) => roundNumber >= r.fromRound && roundNumber <= r.toRound,
  );

  if (!rule) {
    
    return {
      duration: auction.roundDuration,
      antiSnipingWindow: auction.antiSnipingWindow,
      antiSnipingExtension: auction.antiSnipingExtension,
      maxRoundExtensions: auction.maxRoundExtensions,
      winnersPerRound: auction.winnersPerRound,
    };
  }

  
  return {
    duration: rule.duration,
    antiSnipingWindow: rule.antiSnipingWindow ?? auction.antiSnipingWindow,
    antiSnipingExtension: rule.antiSnipingExtension ?? auction.antiSnipingExtension,
    maxRoundExtensions: rule.maxRoundExtensions ?? auction.maxRoundExtensions,
    winnersPerRound: rule.winnersPerRound ?? auction.winnersPerRound,
  };
}
