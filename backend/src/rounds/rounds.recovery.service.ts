import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Round } from './schemas/round.schema';
import { getCompleteRoundJobId } from '../common/types/queue.types';


@Injectable()
export class RoundsRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(RoundsRecoveryService.name);

  constructor(
    @InjectQueue('complete-round') private completeRoundQueue: Queue,
    @InjectModel(Round.name) private roundModel: Model<Round>,
  ) {}

  async onModuleInit(): Promise<void> {
    
    try {
      const rounds = await this.roundModel
        .find({ status: 'active' })
        .select({ _id: 1, auctionId: 1, endTime: 1, extendedEndTime: 1 })
        .lean()
        .exec();

      if (rounds.length === 0) return;

      let ensured = 0;
      for (const r of rounds) {
        const roundId = r._id.toString();
        const auctionId = String((r as any).auctionId);
        const end = (r as any).extendedEndTime ?? (r as any).endTime;
        const delay = Math.max(0, new Date(end).getTime() - Date.now());
        const jobId = getCompleteRoundJobId(roundId);

        
        const existing = await this.completeRoundQueue.getJob(jobId);
        if (existing) continue;

        await this.completeRoundQueue.add(
          'complete-round',
          { roundId, auctionId },
          { jobId, delay, attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
        );
        ensured += 1;
      }

      if (ensured > 0) {
        this.logger.warn(`Recovery ensured ${ensured} missing complete-round jobs for active rounds`);
      }
    } catch (e: any) {
      this.logger.error(`Recovery failed: ${e?.message || e}`, e?.stack);
    }
  }
}

