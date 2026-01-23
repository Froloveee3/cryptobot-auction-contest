import { Module } from '@nestjs/common';
import { EventsCoreModule } from './events-core.module';
import { OutboxDispatchModule } from './outbox-dispatch.module';

@Module({
  imports: [EventsCoreModule, OutboxDispatchModule],
  exports: [EventsCoreModule],
})
export class EventsModule {}
