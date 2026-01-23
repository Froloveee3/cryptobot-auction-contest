import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { IBid, BidStatus } from '../../common/types/entities.types';

export type BidDocument = Bid & Document;

@Schema({ timestamps: true })
export class Bid implements Omit<IBid, '_id'> {
  
  @Prop({ required: true, type: String, index: true })
  auctionId!: string;

  @Prop({ required: true, type: String, index: true })
  userId!: string;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({
    required: true,
    enum: ['active', 'refunded', 'won'],
    default: 'active',
    index: true,
  })
  status!: BidStatus;

  @Prop({ required: true, default: Date.now, index: true })
  timestamp!: Date;

  @Prop({ type: Number, default: null })
  giftNumber!: number | null; 

  @Prop({ type: Number, default: null, index: true })
  wonRoundNumber!: number | null; 

  @Prop({ type: String, default: null, index: true })
  recipientUserId!: string | null; 

  createdAt!: Date;
  updatedAt!: Date;
}

export const BidSchema = SchemaFactory.createForClass(Bid);


BidSchema.index({ auctionId: 1, status: 1, amount: -1, timestamp: 1 }); 
BidSchema.index({ auctionId: 1, userId: 1 }); 
BidSchema.index({ auctionId: 1, timestamp: -1 }); 
BidSchema.index({ auctionId: 1, wonRoundNumber: 1, giftNumber: 1 }); 
BidSchema.index({ giftNumber: 1 }); 



BidSchema.index(
  { auctionId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'uniq_active_bid_per_user_per_auction',
  },
);
