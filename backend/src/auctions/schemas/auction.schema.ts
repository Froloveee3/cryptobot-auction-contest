import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { IAuction, AuctionStatus } from '../../common/types/entities.types';

export type AuctionDocument = Auction & Document;

@Schema({ timestamps: true })
export class Auction implements Omit<IAuction, '_id'> {
  @Prop({ type: String, default: null, index: true })
  createdBy?: string | null;

  @Prop({ type: Boolean, default: false, index: true })
  botsEnabled?: boolean;

  
  @Prop({ type: Number, default: undefined, min: 0 })
  botsCount?: number;
  @Prop({ required: function () { return (this as Auction).status !== 'draft'; } })
  title!: string;

  @Prop({ required: function () { return (this as Auction).status !== 'draft'; } })
  description!: string;

  @Prop({
    required: true,
    enum: ['draft', 'active', 'completed', 'cancelled'],
    default: 'draft',
    index: true,
  })
  status!: AuctionStatus;

  @Prop({
    required: function () { return (this as Auction).status !== 'draft'; },
    validate: {
      validator: function (v: any) {
        return (this as any).status === 'draft' || (Number.isFinite(v) && Number(v) >= 1);
      },
      message: 'totalRounds must be >= 1',
    },
  })
  totalRounds!: number;

  @Prop({ required: true, default: 0, min: 0 })
  currentRound!: number;

  @Prop({
    required: function () { return (this as Auction).status !== 'draft'; },
    validate: {
      validator: function (v: any) {
        return (this as any).status === 'draft' || (Number.isFinite(v) && Number(v) >= 1);
      },
      message: 'winnersPerRound must be >= 1',
    },
  })
  winnersPerRound!: number;

  @Prop({
    required: function () { return (this as Auction).status !== 'draft'; },
    validate: {
      validator: function (v: any) {
        return (this as any).status === 'draft' || (Number.isFinite(v) && Number(v) >= 1);
      },
      message: 'roundDuration must be >= 1',
    },
  }) 
  roundDuration!: number;

  @Prop({
    required: function () { return (this as Auction).status !== 'draft'; },
    default: 10,
    validate: {
      validator: function (v: any) {
        return (this as any).status === 'draft' || (Number.isFinite(v) && Number(v) >= 1);
      },
      message: 'antiSnipingWindow must be >= 1',
    },
  }) 
  antiSnipingWindow!: number;

  @Prop({
    required: function () { return (this as Auction).status !== 'draft'; },
    default: 30,
    validate: {
      validator: function (v: any) {
        return (this as any).status === 'draft' || (Number.isFinite(v) && Number(v) >= 1);
      },
      message: 'antiSnipingExtension must be >= 1',
    },
  }) 
  antiSnipingExtension!: number;

  @Prop({
    required: function () { return (this as Auction).status !== 'draft'; },
    default: 2,
    validate: {
      validator: function (v: any) {
        return (this as any).status === 'draft' || (Number.isFinite(v) && Number(v) >= 0);
      },
      message: 'maxRoundExtensions must be >= 0',
    },
  })
  maxRoundExtensions!: number;

  @Prop({
    required: function () { return (this as Auction).status !== 'draft'; },
    default: 0,
    validate: {
      validator: function (v: any) {
        return (this as any).status === 'draft' || (Number.isFinite(v) && Number(v) >= 0);
      },
      message: 'totalGiftsDistributed must be >= 0',
    },
  })
  totalGiftsDistributed!: number; 

  
  
  @Prop({ type: Date, default: null })
  lastBidAt!: Date | null;

  @Prop({
    required: function () { return (this as Auction).status !== 'draft'; },
    default: 1,
    validate: {
      validator: function (v: any) {
        return (this as any).status === 'draft' || (Number.isFinite(v) && Number(v) >= 1);
      },
      message: 'minBid must be >= 1',
    },
  })
  minBid!: number; 

  @Prop({
    required: function () { return (this as Auction).status !== 'draft'; },
    default: 1,
    validate: {
      validator: function (v: any) {
        return (this as any).status === 'draft' || (Number.isFinite(v) && Number(v) >= 1);
      },
      message: 'minIncrement must be >= 1',
    },
  })
  minIncrement!: number; 

  @Prop({ type: Date, default: null })
  startedAt!: Date | null;

  @Prop({ type: Date, default: null })
  endedAt!: Date | null;

  @Prop({ type: Array, default: undefined })
  schedule?: Array<{
    fromRound: number;
    toRound: number;
    duration: number;
    antiSnipingWindow?: number;
    antiSnipingExtension?: number;
    maxRoundExtensions?: number;
    winnersPerRound?: number;
  }>; 

  createdAt!: Date;
  updatedAt!: Date;
}

export const AuctionSchema = SchemaFactory.createForClass(Auction);


AuctionSchema.index({ status: 1, createdAt: -1 });
AuctionSchema.index({ status: 1, currentRound: 1 });
AuctionSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
