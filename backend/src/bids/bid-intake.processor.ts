import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BidsService } from './bids.service';
import { PlaceBidDto } from '../common/types/dto.types';
import { runWithRequestId } from '../common/utils/request-context';

export type BidIntakeJobData = {
  userId: string;
  auctionId: string;
  dto: PlaceBidDto;
  idempotencyKey?: string;
  requestId?: string;
};

@Processor('bid-intake', { concurrency: Number(process.env.BID_INTAKE_CONCURRENCY || 50) })
export class BidIntakeProcessor extends WorkerHost {
  constructor(private readonly bids: BidsService) {
    super();
  }

  async process(job: Job<BidIntakeJobData>): Promise<void> {
    const requestId = job.data.requestId || (job.id ? `job:${String(job.id)}` : `job:bid-intake:${Date.now()}`);
    return runWithRequestId(requestId, async () => {
      const { userId, auctionId, dto, idempotencyKey } = job.data;
      // This runs the standard Mongo transactional path.
      await this.bids.placeBid(userId, auctionId, dto, { idempotencyKey });
    });
  }
}

