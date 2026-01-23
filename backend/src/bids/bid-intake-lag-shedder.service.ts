import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AuctionBusyError } from '../common/types/domain-errors.types';

@Injectable()
export class BidIntakeLagShedderService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async assertQueueHealthy(auctionId: string): Promise<void> {
    const enabled = this.config.get<string>('BID_INTAKE_LAG_SHEDDER_ENABLED', 'true') === 'true';
    if (!enabled) return;

    const maxWaiting = Number(this.config.get<string>('BID_INTAKE_MAX_WAITING', '50000'));
    const maxOldestMs = Number(this.config.get<string>('BID_INTAKE_MAX_OLDEST_WAITING_MS', '2000'));

    const raw = await this.redis.get('queue:bid-intake:stats');
    if (!raw) return; 

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const waiting = Number(parsed?.counts?.waiting ?? 0);
    const oldestWaitingMs = Number(parsed?.oldestWaitingMs ?? 0);

    const tooMany = Number.isFinite(maxWaiting) && maxWaiting > 0 && waiting > maxWaiting;
    const tooSlow = Number.isFinite(maxOldestMs) && maxOldestMs > 0 && oldestWaitingMs > maxOldestMs;
    if (tooMany || tooSlow) {
      throw new AuctionBusyError(auctionId, {
        reason: 'bid_intake_queue_overloaded',
        waiting,
        oldestWaitingMs,
        maxWaiting,
        maxOldestWaitingMs: maxOldestMs,
      });
    }
  }

  async getAdmissionMultiplier(): Promise<number | null> {
    const raw = await this.redis.get('queue:bid-intake:admission');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as any;
      const m = Number(parsed?.multiplier);
      if (!Number.isFinite(m) || m <= 0) return null;
      return m;
    } catch {
      return null;
    }
  }

  async assertAuctionRate(auctionId: string): Promise<void> {
    const enabled = this.config.get<string>('BID_INTAKE_SMART_ADMISSION_ENABLED', 'true') === 'true';
    if (!enabled) return;

    const base = Number(this.config.get<string>('BID_INTAKE_AUCTION_RPS_BASE', '5000'));
    if (!Number.isFinite(base) || base <= 0) return;

    const mult = (await this.getAdmissionMultiplier()) ?? 1;
    const effective = Math.max(1, Math.floor(base * mult));

    const nowSec = Math.floor(Date.now() / 1000);
    const key = `auction:${auctionId}:intake:rps:${nowSec}`;
    const n = await this.redis.incr(key);
    if (n === 1) {
      await this.redis.expire(key, 2).catch(() => undefined);
    }
    if (n > effective) {
      throw new AuctionBusyError(auctionId, {
        reason: 'bid_intake_admission_rate_limited',
        effectiveRps: effective,
        baseRps: base,
        multiplier: mult,
      });
    }
  }

  async assertGlobalRate(auctionId: string): Promise<void> {
    const enabled = this.config.get<string>('BID_INTAKE_SMART_ADMISSION_ENABLED', 'true') === 'true';
    if (!enabled) return;

    const base = Number(this.config.get<string>('BID_INTAKE_GLOBAL_RPS_BASE', '20000'));
    if (!Number.isFinite(base) || base <= 0) return;

    const mult = (await this.getAdmissionMultiplier()) ?? 1;
    const effective = Math.max(1, Math.floor(base * mult));

    const nowSec = Math.floor(Date.now() / 1000);
    const key = `global:bid-intake:rps:${nowSec}`;
    const n = await this.redis.incr(key);
    if (n === 1) {
      await this.redis.expire(key, 2).catch(() => undefined);
    }
    if (n > effective) {
      throw new AuctionBusyError(auctionId, {
        reason: 'bid_intake_global_rate_limited',
        effectiveGlobalRps: effective,
        baseGlobalRps: base,
        multiplier: mult,
      });
    }
  }
}

