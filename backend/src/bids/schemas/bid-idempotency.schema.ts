import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BidIdempotencyDocument = BidIdempotency & Document;

export type BidIdempotencyStatus = 'processing' | 'completed' | 'failed';

@Schema({ timestamps: true })
export class BidIdempotency {
  @Prop({ required: true, type: String, index: true })
  userId!: string;

  @Prop({ required: true, type: String, index: true })
  auctionId!: string;

  @Prop({ required: true, type: String })
  key!: string;

  @Prop({ required: true, type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' })
  status!: BidIdempotencyStatus;

  
  @Prop({ type: Object, default: null })
  responseBody!: any | null;

  
  @Prop({ type: Number, default: null })
  errorStatus!: number | null;

  @Prop({ type: Object, default: null })
  errorBody!: any | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BidIdempotencySchema = SchemaFactory.createForClass(BidIdempotency);


BidIdempotencySchema.index({ userId: 1, auctionId: 1, key: 1 }, { unique: true, name: 'uniq_bid_idempotency_key' });


BidIdempotencySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24, name: 'ttl_bid_idempotency' });

