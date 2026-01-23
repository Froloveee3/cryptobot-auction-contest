import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { IUser } from '../../common/types/entities.types';

export type UserDocument = User & Document;




const USERNAME_OR_BOT_REGEX = /^(?:[A-Za-z][A-Za-z0-9]*|_bot[A-Za-z0-9]+)$/;

@Schema({ timestamps: true })
export class User implements Omit<IUser, '_id'> {
  @Prop({ required: true, unique: true, match: USERNAME_OR_BOT_REGEX })
  username!: string;

  
  @Prop({ type: String, default: null, select: false })
  passwordHash!: string | null;

  
  @Prop({ required: true, type: String, enum: ['web', 'telegram', 'legacy'], default: 'legacy', index: true })
  authProvider!: 'web' | 'telegram' | 'legacy';

  @Prop({ type: String, default: null, index: true })
  telegramUserId!: string | null;

  @Prop({ type: [String], default: ['user'], index: true })
  roles!: Array<'user' | 'admin'>;

  @Prop({ required: true, default: 0, min: 0 })
  balance!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);



UserSchema.index({ balance: 1 });
UserSchema.index({ authProvider: 1, telegramUserId: 1 }, { unique: true, partialFilterExpression: { telegramUserId: { $ne: null } } });