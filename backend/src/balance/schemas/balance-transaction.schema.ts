import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { IBalanceTransaction, TransactionType } from '../../common/types/entities.types';

export type BalanceTransactionDocument = BalanceTransaction & Document;

@Schema({ timestamps: true })
export class BalanceTransaction implements Omit<IBalanceTransaction, '_id'> {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: string;

  @Prop({
    required: true,
    enum: ['deposit', 'bid_lock', 'bid_refund', 'bid_charge', 'withdrawal'],
  })
  type!: TransactionType;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ required: true, min: 0 })
  balanceBefore!: number;

  @Prop({ required: true, min: 0 })
  balanceAfter!: number;

  @Prop({ type: Types.ObjectId, default: null })
  referenceId!: string | null;

  @Prop({ required: true })
  description!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BalanceTransactionSchema = SchemaFactory.createForClass(BalanceTransaction);


BalanceTransactionSchema.index({ userId: 1, createdAt: -1 });
BalanceTransactionSchema.index({ referenceId: 1 });
BalanceTransactionSchema.index({ type: 1, createdAt: -1 });


BalanceTransactionSchema.index(
  { type: 1, referenceId: 1 },
  { unique: true, partialFilterExpression: { referenceId: { $ne: null } } },
);