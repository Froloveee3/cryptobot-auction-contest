import api from './api';
import { Bot, CreateBotDto } from '../types';

export const botsService = {
  create: async (dto: CreateBotDto): Promise<Bot> => {
    const { data } = await api.post<Bot>('/bots', dto);
    return data;
  },

  getAll: async (auctionId?: string): Promise<Bot[]> => {
    const { data } = await api.get<Bot[]>('/bots', { params: { auctionId } });
    return data;
  },

  getById: async (id: string): Promise<Bot> => {
    const { data } = await api.get<Bot>(`/bots/${id}`);
    return data;
  },

  start: async (id: string): Promise<Bot> => {
    const { data } = await api.post<Bot>(`/bots/${id}/start`);
    return data;
  },

  stop: async (id: string): Promise<Bot> => {
    const { data } = await api.post<Bot>(`/bots/${id}/stop`);
    return data;
  },
};
