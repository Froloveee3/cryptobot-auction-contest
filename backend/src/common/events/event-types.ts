export const EventTypes = {
  BidPlaced: 'BidPlacedEvent',
  RoundStarted: 'RoundStartedEvent',
  RoundEnded: 'RoundEndedEvent',
  RoundExtended: 'RoundExtendedEvent',
  AuctionCreated: 'AuctionCreatedEvent',
  AuctionStarted: 'AuctionStartedEvent',
  AuctionEnded: 'AuctionEndedEvent',
  AuctionUpdated: 'AuctionUpdatedEvent',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

