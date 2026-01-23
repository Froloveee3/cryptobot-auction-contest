import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { IRound, RoundStatus } from '../../common/types/entities.types';

export type RoundDocument = Round & Document;

@Schema({ timestamps: true })
export class Round implements Omit<IRound, '_id'> {
  
  @Prop({ required: true, type: String })
  auctionId!: string;

  @Prop({ required: true, min: 1 })
  roundNumber!: number;

  @Prop({
    required: true,
    enum: ['pending', 'active', 'completed'],
    default: 'pending',
  })
  status!: RoundStatus;

  @Prop({ type: Date, default: null })
  startTime!: Date;

  @Prop({ required: true, type: Date })
  endTime!: Date;

  @Prop({ type: Date, default: null })
  extendedEndTime!: Date | null;

  @Prop({ required: true, default: 0, min: 0 })
  extensionCount!: number;

  @Prop({ required: true, min: 1 })
  winnersCount!: number;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  participants!: string[];

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  winners!: string[];

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  
  @Prop({ type: Date, default: null, index: true })
  lastBidAt!: Date | null;

  
  @Prop({ type: Number, default: undefined })
  roundDuration!: number | undefined; 

  @Prop({ type: Number, default: undefined })
  antiSnipingWindow!: number | undefined; 

  @Prop({ type: Number, default: undefined })
  antiSnipingExtension!: number | undefined; 

  @Prop({ type: Number, default: undefined })
  maxRoundExtensions!: number | undefined;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RoundSchema = SchemaFactory.createForClass(Round);


RoundSchema.index({ auctionId: 1, roundNumber: 1 }, { unique: true });
RoundSchema.index({ auctionId: 1, status: 1 }); 
RoundSchema.index({ status: 1, endTime: 1 }); 
RoundSchema.index({ status: 1, extendedEndTime: 1, endTime: 1 }); 

