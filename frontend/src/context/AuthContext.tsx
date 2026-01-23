import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { usersService } from '../services/users.service';
import { authService } from '../services/auth.service';
import { auctionsService } from '../services/auctions.service';
import { isTelegramWebView, getInitData, initializeTelegramWebApp } from '../utils/telegram';
import { wsManager } from '../services/ws-manager';
import type { CreateAuctionDto } from '../types';

export type AuthMode = 'web' | 'telegram';

interface AuthContextType {
  user: User | null;
  authMode: AuthMode | null;
  telegramInitData: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  loginTelegram: (initData: string) => Promise<void>;
  logout: () => void;
  updateBalance: (amount: number) => Promise<void>;
  refreshUser: () => Promise<void>;
  ensureAuthenticated: () => Promise<boolean>; 
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [telegramInitData, setTelegramInitData] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem('accessToken'));
  const draftSyncDoneRef = React.useRef<string | null>(null);
  const refreshTimerRef = React.useRef<number | null>(null);

  const getDraftStorageKey = (userId: string) => `auctionDraft:${userId}`;

  const parseJwtExpMs = (token: string): number | null => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson) as { exp?: number };
      if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
      return payload.exp * 1000;
    } catch {
      return null;
    }
  };

  const shouldRefreshSoon = (token: string, skewMs = 60_000): boolean => {
    const expMs = parseJwtExpMs(token);
    if (!expMs) return false;
    return expMs - Date.now() <= skewMs;
  };

  const clearAuthStorage = () => {
    // Token can remain after backend reset; if /users/me becomes null we must cleanup fully.
    localStorage.removeItem('accessToken');
    setAccessToken(null);
    sessionStorage.removeItem('telegramInitData');
    // Remove any persisted drafts (they are user-bound and become ambiguous when auth is gone)
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith('auctionDraft:')) localStorage.removeItem(k);
      }
    } catch {
      // ignore
    }
  };

  const resetAuthState = () => {
    setUser(null);
    setAuthMode(null);
    setTelegramInitData(null);
    wsManager.setAuth(null, null);
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  const applyAuthenticatedUser = (me: User | null, mode: AuthMode, token: string | null, initData: string | null) => {
    if (!me) {
      clearAuthStorage();
      resetAuthState();
      return false;
    }
    setAuthMode(mode);
    setTelegramInitData(initData);
    setUser(me);
    wsManager.setAuth(token, initData);
    return true;
  };

  const applyAccessToken = (token: string) => {
    localStorage.setItem('accessToken', token);
    setAccessToken(token);
    // Keep WS auth in sync as well (user/initData are already set in state)
    wsManager.setAuth(token, telegramInitData);
  };

  const refreshToken = async (): Promise<string | null> => {
    try {
      const { accessToken: next } = await authService.refresh();
      if (!next) return null;
      applyAccessToken(next);
      return next;
    } catch {
      return null;
    }
  };

  const scheduleRefresh = (token: string) => {
    const expMs = parseJwtExpMs(token);
    if (!expMs) return;

    // Refresh 60s before exp; ensure minimum delay to avoid tight loops.
    const refreshAtMs = expMs - 60_000;
    const delayMs = Math.max(5_000, refreshAtMs - Date.now());

    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    refreshTimerRef.current = window.setTimeout(async () => {
      const current = localStorage.getItem('accessToken');
      if (!current) return;
      // If token already rotated by another tab/flow, re-schedule based on latest.
      if (current !== token) {
        scheduleRefresh(current);
        return;
      }
      const next = await refreshToken();
      if (!next) {
        // If we can't refresh, keep current session as-is; next API call will decide.
        return;
      }
      scheduleRefresh(next);
    }, delayMs);
  };

  // Initialize Telegram WebApp on mount if in WebView
  useEffect(() => {
    if (isTelegramWebView()) {
      initializeTelegramWebApp();
      const initData = getInitData();
      if (initData) {
        setTelegramInitData(initData);
        // Store in sessionStorage (not localStorage) for security
        sessionStorage.setItem('telegramInitData', initData);
      }
    }
  }, []);

  // Best-effort refresh when tab becomes active again (sleep/hibernation, background tabs, etc.)
  useEffect(() => {
    const onFocus = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;
      if (!shouldRefreshSoon(token, 120_000)) return;
      const next = await refreshToken();
      if (next) scheduleRefresh(next);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep refresh timer aligned with the current token while user is logged in.
  useEffect(() => {
    if (!user?._id) return;
    if (!accessToken) return;
    scheduleRefresh(accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id, accessToken]);

  useEffect(() => {
    if (!user?._id) return;
    if (draftSyncDoneRef.current === user._id) return;
    draftSyncDoneRef.current = user._id;

    const syncDraft = async () => {
      const key = getDraftStorageKey(user._id);
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const dtoRaw = JSON.parse(raw) as CreateAuctionDto;
          // Don't persist legacy UI-only fields.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { maxRoundExtensions, ...dto } = dtoRaw as any;
          await auctionsService.saveDraft(dto as CreateAuctionDto);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Failed to sync draft from localStorage:', error);
          }
        }
        return;
      }

      try {
        const draft = await auctionsService.getMyDraft();
        if (draft) {
          const dto: CreateAuctionDto = {
            title: draft.title,
            description: draft.description,
            totalRounds: draft.totalRounds,
            winnersPerRound: draft.winnersPerRound,
            roundDuration: draft.roundDuration,
            minBid: draft.minBid,
            minIncrement: draft.minIncrement,
            antiSnipingWindow: draft.antiSnipingWindow,
            antiSnipingExtension: draft.antiSnipingExtension,
            botsEnabled: Boolean((draft as any).botsEnabled),
            botsCount: (draft as any).botsCount,
          };
          localStorage.setItem(key, JSON.stringify(dto));
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to sync draft from server:', error);
        }
      }
    };

    void syncDraft();
  }, [user?._id]);

  // Try to restore auth on mount
  useEffect(() => {
    const restoreAuth = async () => {
      // Check Telegram WebView first
      if (isTelegramWebView()) {
        const initData = getInitData() || sessionStorage.getItem('telegramInitData');
        if (initData) {
          let token = localStorage.getItem('accessToken');
          try {
            if (token && shouldRefreshSoon(token, 90_000)) {
              const next = await refreshToken();
              if (next) token = next;
            }
            // Try to get user with initData (via x-telegram-init-data header)
            const me = await usersService.me();
            if (applyAuthenticatedUser(me, 'telegram', token, initData)) {
              if (token) scheduleRefresh(token);
              return;
            }
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.error('Telegram auth failed, trying JWT:', error);
            }
            // Fall through to JWT check
          }
        }
      }

      // Check JWT (web auth)
      let token = localStorage.getItem('accessToken');
      if (token) {
        try {
          if (shouldRefreshSoon(token, 90_000)) {
            const next = await refreshToken();
            if (next) token = next;
          }
          const me = await usersService.me();
          applyAuthenticatedUser(me, 'web', token, null);
          scheduleRefresh(token);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('JWT auth failed:', error);
          }
          clearAuthStorage();
          resetAuthState();
        }
      }
    };

    restoreAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const { accessToken } = await authService.login(username, password);
      applyAccessToken(accessToken);
      const me = await usersService.me();
      if (!applyAuthenticatedUser(me, 'web', accessToken, null)) {
        throw new Error('AUTH_USER_NOT_FOUND');
      }
      scheduleRefresh(accessToken);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Login error:', error);
      }
      throw error;
    }
  };

  const register = async (username: string, password: string) => {
    try {
      const { accessToken } = await authService.register(username, password);
      applyAccessToken(accessToken);
      const me = await usersService.me();
      if (!applyAuthenticatedUser(me, 'web', accessToken, null)) {
        throw new Error('AUTH_USER_NOT_FOUND');
      }
      scheduleRefresh(accessToken);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Register error:', error);
      }
      throw error;
    }
  };

  const loginTelegram = async (initData: string) => {
    try {
      const { accessToken } = await authService.loginTelegram(initData);
      applyAccessToken(accessToken);
      sessionStorage.setItem('telegramInitData', initData);
      const me = await usersService.me();
      if (!applyAuthenticatedUser(me, 'telegram', accessToken, initData)) {
        throw new Error('AUTH_USER_NOT_FOUND');
      }
      scheduleRefresh(accessToken);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Telegram login error:', error);
      }
      throw error;
    }
  };

  const logout = () => {
    clearAuthStorage();
    resetAuthState();
  };

  const updateBalance = async (amount: number) => {
    if (!user) return;
    try {
      const updatedUser = await usersService.depositMe(amount);
      setUser(updatedUser);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Update balance error:', error);
      }
      throw error;
    }
  };

  const refreshUser = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token && shouldRefreshSoon(token, 90_000)) {
        await refreshToken();
      }
      const updatedUser = await usersService.me();
      if (!updatedUser) {
        // Token may be stale (e.g. backend reset). Ensure we don't keep broken session.
        clearAuthStorage();
        resetAuthState();
        return;
      }
      setUser(updatedUser);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Refresh user error:', error);
      }
    }
  };

  /**
   * Ensure user is authenticated (for protected routes)
   * Returns true if authenticated, false otherwise
   * For Telegram WebView: tries to authenticate with initData
   * For Web: requires existing JWT
   */
  const ensureAuthenticated = async (): Promise<boolean> => {
    if (user) {
      return true;
    }

    // Try Telegram WebView auth
    if (isTelegramWebView()) {
      const initData = getInitData() || sessionStorage.getItem('telegramInitData');
      if (initData) {
        try {
          await loginTelegram(initData);
          return true;
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Telegram auto-login failed:', error);
          }
          return false;
        }
      }
    }

      // Check JWT
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          if (shouldRefreshSoon(token, 90_000)) {
            await refreshToken();
          }
          const me = await usersService.me();
          const effective = localStorage.getItem('accessToken') || token;
          const ok = applyAuthenticatedUser(me, 'web', effective, null);
          if (ok) scheduleRefresh(effective);
          return ok;
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('JWT validation failed:', error);
          }
          clearAuthStorage();
          resetAuthState();
          return false;
        }
      }

      return false;
    };

  return (
    <AuthContext.Provider
      value={{
        user,
        authMode,
        telegramInitData,
        login,
        register,
        loginTelegram,
        logout,
        updateBalance,
        refreshUser,
        ensureAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
