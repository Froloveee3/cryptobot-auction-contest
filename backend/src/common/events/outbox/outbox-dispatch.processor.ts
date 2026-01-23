import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

@Processor('outbox-dispatch')
export class OutboxDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboxDispatchProcessor.name);

  constructor(private readonly dispatcher: OutboxDispatcherService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    this.logger.debug('Outbox dispatch job triggered');
    
    const count = await this.dispatcher.drainBatch(200);
    this.logger.debug(`Outbox dispatch completed, processed ${count} events`);
  }
}

