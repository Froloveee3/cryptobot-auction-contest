import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { DomainEvent } from '../../services/event-bus.service';

export type OutboxEventDocument = OutboxEvent & Document;

export type OutboxStatus = 'pending' | 'processing' | 'published' | 'failed';

@Schema({ timestamps: true })
export class OutboxEvent {
  @Prop({ required: true })
  eventId!: string;

  @Prop({ required: true })
  eventType!: string;

  @Prop({ required: true, default: 1 })
  eventVersion!: number;

  @Prop({ type: Date, required: true })
  timestamp!: Date;

  @Prop({ type: String, default: null })
  requestId!: string | null;

  @Prop({ type: Object, required: true })
  event!: DomainEvent;

  @Prop({ required: true, enum: ['pending', 'processing', 'published', 'failed'], default: 'pending' })
  status!: OutboxStatus;

  @Prop({ type: Number, required: true, default: 0 })
  attempts!: number;

  @Prop({ type: Date, default: null })
  lockedAt!: Date | null;

  @Prop({ type: Date, default: null })
  nextAttemptAt!: Date | null;

  @Prop({ type: String, default: null })
  lastError!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);

OutboxEventSchema.index({ eventId: 1 }, { unique: true });
OutboxEventSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
OutboxEventSchema.index({ lockedAt: 1 });
