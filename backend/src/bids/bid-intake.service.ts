import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { BidIntakeJobData } from './bid-intake.processor';
import { BidIntakeLagShedderService } from './bid-intake-lag-shedder.service';
import { BidIntakeUserFairnessService } from './bid-intake-user-fairness.service';

@Injectable()
export class BidIntakeService {
  constructor(
    @InjectQueue('bid-intake') private readonly q: Queue,
    private readonly lagShedder: BidIntakeLagShedderService,
    private readonly fairness: BidIntakeUserFairnessService,
  ) {}

  async enqueue(params: BidIntakeJobData): Promise<{ intakeId: string }> {
    await this.lagShedder.assertQueueHealthy(params.auctionId);
    await this.lagShedder.assertGlobalRate(params.auctionId);
    await this.lagShedder.assertAuctionRate(params.auctionId);
    await this.fairness.assertUserRate(params.auctionId, params.userId);

    
    
    
    const safeIdPart = (s: string): string => s.replaceAll(':', '_');
    const jobId =
      params.idempotencyKey && params.idempotencyKey.trim().length > 0
        ? `bid-intake__${params.auctionId}__${params.userId}__${safeIdPart(params.idempotencyKey.trim())}`
        : `bid-intake__${params.auctionId}__${params.userId}__${Date.now()}__${Math.random().toString(16).slice(2)}`;

    // Priority lanes:
    // - raise is latency-sensitive and should be processed first
    // - new can be slightly delayed under load
    const mode = (params.dto as any)?.mode || 'new';
    const priority = mode === 'raise' ? 1 : 5;

    await this.q.add('bid-intake', params, {
      jobId,
      priority,
      removeOnComplete: { age: 3600, count: 10000 },
      removeOnFail: { age: 86400 },
    });

    return { intakeId: jobId };
  }
}

