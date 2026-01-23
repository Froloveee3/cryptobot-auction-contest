import api from './api';
import { AuthTokenResponse } from '../contracts/api';

export const authService = {
  
  register: async (username: string, password: string): Promise<AuthTokenResponse> => {
    const { data } = await api.post<AuthTokenResponse>('/auth/register', { username, password });
    return data;
  },

  
  login: async (username: string, password: string): Promise<AuthTokenResponse> => {
    const { data } = await api.post<AuthTokenResponse>('/auth/login', { username, password });
    return data;
  },

  
  loginTelegram: async (initData: string): Promise<AuthTokenResponse> => {
    const { data } = await api.post<AuthTokenResponse>(
      '/auth/telegram',
      {},
      {
        headers: {
          'x-telegram-init-data': initData,
        },
      },
    );
    return data;
  },

  
  refresh: async (): Promise<AuthTokenResponse> => {
    const { data } = await api.post<AuthTokenResponse>('/auth/refresh', {});
    return data;
  },
};

