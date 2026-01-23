import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AuctionBusyError } from '../common/types/domain-errors.types';
import { BidIntakeLagShedderService } from './bid-intake-lag-shedder.service';


@Injectable()
export class BidIntakeUserFairnessService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly lagShedder: BidIntakeLagShedderService,
  ) {}

  private key(auctionId: string, userId: string): string {
    return `auction:${auctionId}:user:${userId}:intake:tb`;
  }

  async assertUserRate(auctionId: string, userId: string): Promise<void> {
    const enabled = this.config.get<string>('BID_INTAKE_USER_FAIRNESS_ENABLED', 'true') === 'true';
    if (!enabled) return;

    const baseRps = Number(this.config.get<string>('BID_INTAKE_USER_RPS_BASE', '10'));
    const burst = Number(this.config.get<string>('BID_INTAKE_USER_BURST', '30'));
    if (!Number.isFinite(baseRps) || baseRps <= 0) return;
    if (!Number.isFinite(burst) || burst <= 0) return;

    // Scale with admission multiplier so fairness follows global pressure.
    const mult = (await this.lagShedder.getAdmissionMultiplier()) ?? 1;
    const rate = Math.max(0.1, baseRps * mult);

    const nowMs = Date.now();
    const key = this.key(auctionId, userId);

    // Hash fields: tokens, lastMs
    const lua = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])

local t = redis.call('HGET', key, 'tokens')
local last = redis.call('HGET', key, 'lastMs')
local tokens = tonumber(t)
local lastMs = tonumber(last)

if tokens == nil then tokens = burst end
if lastMs == nil then lastMs = now end

local deltaMs = now - lastMs
if deltaMs < 0 then deltaMs = 0 end

tokens = tokens + (deltaMs / 1000.0) * rate
if tokens > burst then tokens = burst end

local allowed = 0
if tokens >= 1.0 then
  allowed = 1
  tokens = tokens - 1.0
end

redis.call('HSET', key, 'tokens', tokens, 'lastMs', now)
redis.call('EXPIRE', key, 120)

return { allowed, tokens }
`;

    const res = (await this.redis.eval(lua, 1, key, nowMs, rate, burst)) as any;
    const allowed = Array.isArray(res) ? Number(res[0]) : 0;
    const tokensLeft = Array.isArray(res) ? Number(res[1]) : 0;

    if (allowed !== 1) {
      throw new AuctionBusyError(auctionId, {
        reason: 'bid_intake_user_rate_limited',
        userId,
        baseUserRps: baseRps,
        multiplier: mult,
        effectiveUserRps: rate,
        burst,
        tokensLeft,
      });
    }
  }
}

