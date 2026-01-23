import { Injectable, Inject, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';


@Injectable()
export class BidIntakeSmartAdmissionService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private lastMult = 1;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    if ((process.env.APP_MODE || 'api') !== 'api') return;

    const enabled = this.config.get<string>('BID_INTAKE_SMART_ADMISSION_ENABLED', 'true') === 'true';
    if (!enabled) return;

    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined);
    }, 1000);
    void this.tick().catch(() => undefined);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
  }

  private async tick(): Promise<void> {
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

    const targetMs = Number(this.config.get<string>('BID_INTAKE_TARGET_OLDEST_WAITING_MS', '500'));
    const minMult = Number(this.config.get<string>('BID_INTAKE_ADMISSION_MIN_MULT', '0.05'));
    const maxMult = Number(this.config.get<string>('BID_INTAKE_ADMISSION_MAX_MULT', '1'));
    const alpha = Number(this.config.get<string>('BID_INTAKE_ADMISSION_EMA_ALPHA', '0.2'));

    
    let desired = 1;
    if (Number.isFinite(oldestWaitingMs) && oldestWaitingMs > 0 && Number.isFinite(targetMs) && targetMs > 0) {
      desired = targetMs / oldestWaitingMs;
    }

    
    const waitingSoft = Number(this.config.get<string>('BID_INTAKE_WAITING_SOFT', '20000'));
    if (Number.isFinite(waitingSoft) && waitingSoft > 0 && waiting > waitingSoft) {
      desired *= waitingSoft / Math.max(waitingSoft, waiting);
    }

    desired = this.clamp(desired, minMult, maxMult);

    
    const a = this.clamp(alpha, 0.01, 0.8);
    const next = this.clamp(this.lastMult * (1 - a) + desired * a, minMult, maxMult);
    this.lastMult = next;

    await this.redis.setex(
      'queue:bid-intake:admission',
      3,
      JSON.stringify({
        at: Date.now(),
        multiplier: next,
        desired,
        oldestWaitingMs,
        waiting,
        targetMs,
      }),
    );
  }
}

