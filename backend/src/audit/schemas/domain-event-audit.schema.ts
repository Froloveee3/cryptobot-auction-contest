import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DomainEventAuditDocument = DomainEventAudit & Document;

@Schema({ timestamps: true })
export class DomainEventAudit {
  @Prop({ required: true })
  eventId!: string;

  @Prop({ required: true })
  eventType!: string;

  @Prop({ required: true, default: 1 })
  eventVersion!: number;

  @Prop({ required: true })
  timestamp!: Date;

  @Prop({ type: String, default: null })
  requestId!: string | null;

  
  @Prop({ type: String, default: null, index: true })
  auctionId!: string | null;

  @Prop({ type: String, default: null, index: true })
  roundId!: string | null;

  @Prop({ type: String, default: null, index: true })
  bidId!: string | null;

  
  @Prop({ type: Object, required: true })
  payload!: Record<string, unknown>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const DomainEventAuditSchema = SchemaFactory.createForClass(DomainEventAudit);

DomainEventAuditSchema.index({ eventType: 1, createdAt: -1 });
DomainEventAuditSchema.index({ requestId: 1, createdAt: -1 });
DomainEventAuditSchema.index({ eventId: 1 }, { unique: true });
