import { Injectable } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDurationMs: Histogram<string>;
  readonly httpRequestDurationPercentiles: Histogram<string>;
  readonly bullmqJobsTotal: Counter<string>;
  readonly bullmqJobDurationMs: Histogram<string>;
  readonly bullmqQueueJobs: Gauge<string>;
  readonly bullmqQueueOldestWaitingMs: Gauge<string>;
  
  
  readonly cacheOperationsTotal: Counter<string>;
  readonly cacheHitRate: Counter<string>;
  
  
  readonly errorsTotal: Counter<string>;
  
  
  readonly bidsTotal: Counter<string>;
  readonly auctionsTotal: Counter<string>;
  readonly roundsTotal: Counter<string>;

  constructor() {
    
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDurationMs = new Histogram({
      name: 'http_request_duration_ms',
      help: 'HTTP request duration in milliseconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry],
    });

    this.bullmqJobsTotal = new Counter({
      name: 'bullmq_jobs_total',
      help: 'Total BullMQ jobs processed',
      labelNames: ['queue', 'name', 'status'],
      registers: [this.registry],
    });

    this.bullmqJobDurationMs = new Histogram({
      name: 'bullmq_job_duration_ms',
      help: 'BullMQ job processing duration in milliseconds',
      labelNames: ['queue', 'name', 'status'],
      buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
      registers: [this.registry],
    });

    this.bullmqQueueJobs = new Gauge({
      name: 'bullmq_queue_jobs',
      help: 'BullMQ queue jobs by state (waiting/active/delayed/paused/failed/completed)',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
    });

    this.bullmqQueueOldestWaitingMs = new Gauge({
      name: 'bullmq_queue_oldest_waiting_ms',
      help: 'Age of the oldest waiting job in the queue (ms)',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    
    this.httpRequestDurationPercentiles = new Histogram({
      name: 'http_request_duration_percentiles_ms',
      help: 'HTTP request duration percentiles (p50, p95, p99) in milliseconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
      registers: [this.registry],
    });

    
    this.cacheOperationsTotal = new Counter({
      name: 'cache_operations_total',
      help: 'Total cache operations (hits + misses)',
      labelNames: ['operation', 'key_prefix', 'result'],
      registers: [this.registry],
    });

    this.cacheHitRate = new Counter({
      name: 'cache_hits_total',
      help: 'Cache hits count',
      labelNames: ['key_prefix'],
      registers: [this.registry],
    });

    
    this.errorsTotal = new Counter({
      name: 'errors_total',
      help: 'Total errors by type and code',
      labelNames: ['type', 'code', 'severity'],
      registers: [this.registry],
    });

    
    this.bidsTotal = new Counter({
      name: 'bids_total',
      help: 'Total bids placed',
      labelNames: ['auction_id', 'round_id', 'status'],
      registers: [this.registry],
    });

    this.auctionsTotal = new Counter({
      name: 'auctions_total',
      help: 'Total auctions',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.roundsTotal = new Counter({
      name: 'rounds_total',
      help: 'Total rounds',
      labelNames: ['auction_id', 'status'],
      registers: [this.registry],
    });
  }

  async metricsText(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}

