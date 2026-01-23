import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { getCompleteRoundJobId } from '../common/types/queue.types';

@Injectable()
export class RoundJobsService {
  private readonly logger = new Logger(RoundJobsService.name);

  constructor(@InjectQueue('complete-round') private readonly completeRoundQueue: Queue) {}

  async scheduleCompleteRound(params: { roundId: string; auctionId: string; endsAt: Date }): Promise<void> {
    const { roundId, auctionId, endsAt } = params;
    const nowMs = Date.now();
    const delay = Math.max(0, endsAt.getTime() - nowMs);
    const jobId = getCompleteRoundJobId(roundId);
    this.logger.debug(`Scheduling complete-round job for round ${roundId}, delay=${delay}ms, jobId=${jobId}`);
    await this.completeRoundQueue.remove(jobId).catch(() => undefined);
    await this.completeRoundQueue.add('complete-round', { roundId, auctionId }, { jobId, delay });
    this.logger.debug(`Job ${jobId} scheduled successfully`);
  }
}

