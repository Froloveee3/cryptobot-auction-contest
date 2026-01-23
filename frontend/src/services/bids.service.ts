import api from './api';
import { Bid, PlaceBidDto, PaginatedResponse } from '../types';
import { BidResponseDto, PaginatedResponseDto, normalizeBid } from '../contracts/api';


export const bidsService = {
  
  placeBid: async (auctionId: string, dto: PlaceBidDto): Promise<Bid> => {
    const { data } = await api.post<BidResponseDto>(`/auctions/${auctionId}/bids`, dto);
    return normalizeBid(data);
  },

  /**
   * Get bids for an auction (paginated)
   * @param auctionId Auction ID
   * @param userId Optional: filter by user ID
   * @param page Page number (default: 1)
   * @param limit Items per page (default: 20)
   * @returns Paginated bids
   */
  getByAuction: async (
    auctionId: string,
    userId?: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<Bid>> => {
    const { data } = await api.get<PaginatedResponseDto<BidResponseDto>>(
      `/auctions/${auctionId}/bids`,
      { params: { userId, page, limit } },
    );
    return {
      ...data,
      data: data.data.map(normalizeBid),
    };
  },
};
