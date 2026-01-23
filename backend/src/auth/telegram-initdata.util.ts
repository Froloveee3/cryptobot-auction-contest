import { createHmac } from 'crypto';

export type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

function buildDataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  return pairs.join('\n');
}

function hmacSha256Raw(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function hmacSha256(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

export function validateTelegramInitData(paramsRaw: string, botToken: string, maxAgeSec: number): TelegramUser | null {
  const initDataRaw = (paramsRaw || '').trim();
  if (!initDataRaw) return null;
  if (!botToken) return null;

  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  if (!hash) return null;

  const checkString = buildDataCheckString(params);
  // Telegram docs: key = HMAC-SHA256(botToken, "WebAppData")
  const secretKey = hmacSha256Raw('WebAppData', botToken);
  const computed = hmacSha256(secretKey, checkString);
  if (computed !== hash) return null;

  // Optional freshness check
  const authDate = Number(params.get('auth_date') || '0');
  if (maxAgeSec > 0 && authDate > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDate > maxAgeSec) return null;
  }

  // Parse user
  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    const tgUser = JSON.parse(userJson) as TelegramUser;
    if (!tgUser?.id) return null;
    return tgUser;
  } catch {
    return null;
  }
}

