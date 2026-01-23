import axios from 'axios';
import { API_URL } from '../config/api';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for auth headers
api.interceptors.request.use(
  (config) => {
    // Priority 1: JWT token (web auth)
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Telegram initData (Telegram WebView).
    // Note: Don't use localStorage for initData (security), use sessionStorage.
    // IMPORTANT: attach even if JWT exists so backend can fall back when JWT expires.
    const telegramInitData = sessionStorage.getItem('telegramInitData');
    if (telegramInitData && !config.headers?.['x-telegram-init-data']) {
      config.headers = config.headers ?? {};
      config.headers['x-telegram-init-data'] = telegramInitData;
    }

    // Debug logging (only in dev)
    if (process.env.NODE_ENV === 'development') {
      console.log('API Request:', config.method?.toUpperCase(), config.url, config.data);
    }
    return config;
  },
  (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('API Request Error:', error);
    }
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    // Debug logging (only in dev)
    if (process.env.NODE_ENV === 'development') {
      console.log('API Response:', response.status, response.data);
    }
    return response;
  },
  (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('API Response Error:', error.response?.status, error.response?.data || error.message);
    }
    return Promise.reject(error);
  }
);

export default api;
