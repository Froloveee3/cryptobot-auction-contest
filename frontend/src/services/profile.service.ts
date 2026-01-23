import api from './api';
import type { PaginatedResponse } from '../types';
import type { BalanceTransaction, UserGiftCollectionEntry, UserBidHistoryEntry } from '../types';
import {
  PaginatedResponseDto,
  UserBidHistoryEntryDto,
  UserGiftCollectionEntryDto,
  BalanceTransactionResponseDto,
  normalizeBid,
  normalizeBalanceTransaction,
  normalizeUserGiftCollectionEntry,
} from '../contracts/api';

export const profileService = {
  getMyBids: async (page = 1, limit = 20): Promise<PaginatedResponse<UserBidHistoryEntry>> => {
    const { data } = await api.get<PaginatedResponseDto<UserBidHistoryEntryDto>>('/users/me/bids', {
      params: { page, limit },
    });
    return {
      ...data,
      data: data.data.map((item) => ({
        ...normalizeBid(item),
        auctionTitle: item.auctionTitle ?? null,
      })) as Array<UserBidHistoryEntry>,
    };
  },

  getMyCollection: async (page = 1, limit = 20): Promise<PaginatedResponse<UserGiftCollectionEntry>> => {
    const { data } = await api.get<PaginatedResponseDto<UserGiftCollectionEntryDto>>('/users/me/collection', {
      params: { page, limit },
    });
    return {
      ...data,
      data: data.data.map(normalizeUserGiftCollectionEntry),
    };
  },

  getMyBalanceHistory: async (page = 1, limit = 20): Promise<PaginatedResponse<BalanceTransaction>> => {
    const { data } = await api.get<PaginatedResponseDto<BalanceTransactionResponseDto>>('/users/me/transactions', {
      params: { page, limit },
    });
    return {
      ...data,
      data: data.data.map(normalizeBalanceTransaction),
    };
  },
};

