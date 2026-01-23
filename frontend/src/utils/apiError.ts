import axios from 'axios';

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null;
}

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;

    if (isRecord(data)) {
      const msg = data.message;
      if (typeof msg === 'string' && msg.trim()) return msg;
      if (Array.isArray(msg) && msg.length) return msg.map(String).join(', ');

      const err = data.error;
      if (typeof err === 'string' && err.trim()) return err;

      const details = data.details;
      if (typeof details === 'string' && details.trim()) return details;
    }

    if (typeof status === 'number') {
      return `Request failed (${status})`;
    }

    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

