import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventBusService } from '../services/event-bus.service';
import { OutboxEvent, OutboxEventSchema } from './outbox/outbox-event.schema';
import { OutboxService } from './outbox/outbox.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: OutboxEvent.name, schema: OutboxEventSchema }])],
  providers: [EventBusService, OutboxService],
  exports: [EventBusService, OutboxService],
})
export class EventsCoreModule {}

