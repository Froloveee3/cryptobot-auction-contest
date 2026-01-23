import api from './api';
import { Auction, CreateAuctionDto, PaginatedResponse, Round } from '../types';

type AuctionWire = Partial<Auction> & { _id?: string; id?: string };

function normalizeAuction(a: AuctionWire): Auction {
  const _id = (a._id ?? a.id) as string;
  return { ...(a as Auction), _id };
}

function normalizeAuctionPage(resp: PaginatedResponse<AuctionWire>): PaginatedResponse<Auction> {
  return {
    ...resp,
    data: Array.isArray(resp.data) ? resp.data.map(normalizeAuction) : [],
  } as PaginatedResponse<Auction>;
}

export const auctionsService = {
  create: async (dto: CreateAuctionDto): Promise<Auction> => {
    const { data } = await api.post<AuctionWire>('/auctions', dto);
    return normalizeAuction(data);
  },

  saveDraft: async (dto: CreateAuctionDto): Promise<Auction> => {
    const { data } = await api.post<AuctionWire>('/auctions', dto);
    return normalizeAuction(data);
  },

  getMyDraft: async (): Promise<Auction | null> => {
    const { data } = await api.get<AuctionWire | null>('/auctions/my-draft');
    return data ? normalizeAuction(data) : null;
  },

  getAll: async (status?: string, page = 1, limit = 20): Promise<PaginatedResponse<Auction>> => {
    
    const { data } = await api.get<PaginatedResponse<AuctionWire>>('/auctions', {
      params: { status, page, limit },
    });
    return normalizeAuctionPage(data);
  },

  getById: async (id: string): Promise<Auction> => {
    const { data } = await api.get<AuctionWire>(`/auctions/${id}`);
    return normalizeAuction(data);
  },

  start: async (id: string): Promise<Auction> => {
    const { data } = await api.post<AuctionWire>(`/auctions/${id}/start`);
    return normalizeAuction(data);
  },

  getCurrentRound: async (id: string): Promise<Round | null> => {
    const { data } = await api.get<Round | null>(`/auctions/${id}/current-round`);
    return data;
  },

  getRounds: async (id: string): Promise<Round[]> => {
    const { data } = await api.get<Round[]>(`/auctions/${id}/rounds`);
    return data;
  },
};
