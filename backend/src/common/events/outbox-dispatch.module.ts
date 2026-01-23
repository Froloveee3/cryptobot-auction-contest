import { Module } from '@nestjs/common';
import { OutboxDispatcherService } from './outbox/outbox-dispatcher.service';
import { OutboxDispatchProcessor } from './outbox/outbox-dispatch.processor';

@Module({
  providers: [OutboxDispatcherService, OutboxDispatchProcessor],
})
export class OutboxDispatchModule {}

