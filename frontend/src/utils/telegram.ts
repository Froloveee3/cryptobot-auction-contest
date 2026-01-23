

import { retrieveRawInitData } from '@tma.js/sdk';


declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name?: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
          auth_date: number;
          hash: string;
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        onEvent: (eventType: string, eventHandler: () => void) => void;
        offEvent: (eventType: string, eventHandler: () => void) => void;
        version: string;
        platform: string;
        colorScheme: 'light' | 'dark';
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
        };
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
        headerColor: string;
        backgroundColor: string;
        BackButton: {
          isVisible: boolean;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
          show: () => void;
          hide: () => void;
        };
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          isProgressVisible: boolean;
          setText: (text: string) => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          showProgress: (leaveActive?: boolean) => void;
          hideProgress: () => void;
          setParams: (params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }) => void;
        };
      };
    };
  }
}


export function isTelegramWebView(): boolean {
  return typeof window !== 'undefined' && typeof window.Telegram !== 'undefined' && typeof window.Telegram.WebApp !== 'undefined';
}


export function getInitData(): string | null {
  try {
    const initData = retrieveRawInitData();
    return initData && initData.length > 0 ? initData : null;
  } catch {
    return null;
  }
}


export function getTelegramUser(): {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
} | null {
  if (!isTelegramWebView()) {
    return null;
  }
  return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
}


export function initializeTelegramWebApp(): void {
  if (!isTelegramWebView()) {
    return;
  }
  try {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
  } catch (error) {
    console.error('Failed to initialize Telegram WebApp:', error);
  }
}


export function closeTelegramWebView(): void {
  if (!isTelegramWebView()) {
    return;
  }
  try {
    window.Telegram?.WebApp?.close();
  } catch (error) {
    console.error('Failed to close Telegram WebView:', error);
  }
}


export function getTelegramTheme(): 'light' | 'dark' {
  if (!isTelegramWebView()) {
    return 'light';
  }
  return window.Telegram?.WebApp?.colorScheme || 'light';
}


export function getTelegramThemeParams(): {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
} {
  if (!isTelegramWebView()) {
    return {};
  }
  return window.Telegram?.WebApp?.themeParams || {};
}
