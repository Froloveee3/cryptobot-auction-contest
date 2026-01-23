import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MetricsService } from '../metrics/metrics.service';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class BidIntakeQueueMetricsService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectQueue('bid-intake') private readonly q: Queue,
    private readonly metrics: MetricsService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    if ((process.env.APP_MODE || 'api') !== 'api') return;
    
    this.timer = setInterval(() => {
      void this.collect().catch(() => undefined);
    }, 1000);
    
    void this.collect().catch(() => undefined);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async collect(): Promise<void> {
    const queueName = this.q.name;
    const counts = await this.q.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'paused',
      'failed',
      'completed',
    );

    for (const [state, value] of Object.entries(counts)) {
      this.metrics.bullmqQueueJobs.labels(queueName, state).set(Number(value));
    }

    
    const jobs = await this.q.getJobs(['waiting'], 0, 0);
    const oldest = jobs && jobs.length > 0 ? jobs[0] : null;
    let oldestWaitingMs = 0;
    if (oldest && typeof oldest.timestamp === 'number') {
      const ageMs = Math.max(0, Date.now() - oldest.timestamp);
      oldestWaitingMs = ageMs;
      this.metrics.bullmqQueueOldestWaitingMs.labels(queueName).set(ageMs);
    } else {
      this.metrics.bullmqQueueOldestWaitingMs.labels(queueName).set(0);
    }

    
    
    const key = `queue:${queueName}:stats`;
    await this.redis
      .setex(
        key,
        3,
        JSON.stringify({
          at: Date.now(),
          counts,
          oldestWaitingMs,
        }),
      )
      .catch(() => undefined);
  }
}

