import api from './api';
import { User, PaginatedResponse } from '../types';

type UserWire = Partial<User> & { _id?: string; id?: string };

function normalizeUser(u: UserWire): User {
  const _id = (u._id ?? u.id) as string;
  return { ...(u as User), _id };
}

export const usersService = {
  me: async (): Promise<User | null> => {
    
    const { data } = await api.get<UserWire | null>('/users/me');
    if (!data) return null;
    const normalized = normalizeUser(data);
    
    if (!normalized._id || typeof normalized.balance !== 'number' || !Number.isFinite(normalized.balance)) {
      return null;
    }
    return normalized;
  },

  depositMe: async (amount: number): Promise<User> => {
    const { data } = await api.post<UserWire>('/users/me/deposit', { amount });
    return normalizeUser(data);
  },

  create: async (username: string, initialBalance?: number): Promise<User> => {
    const { data } = await api.post<UserWire>('/users', { username, initialBalance });
    return normalizeUser(data);
  },

  getById: async (id: string): Promise<User> => {
    const { data } = await api.get<UserWire>(`/users/${id}`);
    return normalizeUser(data);
  },

  deposit: async (userId: string, amount: number): Promise<User> => {
    const { data } = await api.post<UserWire>(`/users/${userId}/deposit`, { amount });
    return normalizeUser(data);
  },

  getBalance: async (userId: string): Promise<number> => {
    const { data } = await api.get<number>(`/users/${userId}/balance`);
    return data;
  },

  getTransactions: async (
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<any>> => {
    const { data } = await api.get<PaginatedResponse<any>>(
      `/users/${userId}/transactions`,
      { params: { page, limit } },
    );
    return data;
  },

  lookup: async (params: { kind: 'username' | 'telegramId'; value: string }): Promise<{
    exists: boolean;
    userId?: string;
    username?: string;
    telegramUserId?: string;
  }> => {
    const { data } = await api.get('/users/lookup', { params });
    return data;
  },
};
