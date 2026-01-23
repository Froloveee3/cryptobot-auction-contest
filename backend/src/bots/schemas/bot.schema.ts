import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { IBot } from '../../common/types/entities.types';

export type BotDocument = Bot & Document;

@Schema({ timestamps: true })
export class Bot implements Omit<IBot, '_id'> {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  type!: 'simple' | 'aggressive' | 'sniper' | 'strategic';

  @Prop({ required: true, type: String, ref: 'User' })
  userId!: string;

  @Prop({ type: String, ref: 'Auction', default: null })
  auctionId!: string | null; 

  @Prop({ required: true, default: true })
  isActive!: boolean;

  @Prop({ required: true, default: 1000, min: 1 })
  minAmount!: number; 

  @Prop({ required: true, default: 10000, min: 1 })
  maxAmount!: number; 

  @Prop({ required: true, default: 5000, min: 1000 })
  minInterval!: number; 

  @Prop({ required: true, default: 30000, min: 1000 })
  maxInterval!: number; 

  @Prop({ required: true, default: 0 })
  totalBids!: number; 

  @Prop({ type: Date, default: null })
  lastBidAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BotSchema = SchemaFactory.createForClass(Bot);


BotSchema.index({ userId: 1, isActive: 1 });
BotSchema.index({ auctionId: 1, isActive: 1 });
