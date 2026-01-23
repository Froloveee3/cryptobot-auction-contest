import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import type { TelegramUser } from './telegram-initdata.util';

@Injectable()
export class TelegramUsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  
  async ensureTelegramUser(tg: TelegramUser): Promise<{ userId: string; roles: Array<'user' | 'admin'> }> {
    const telegramUserId = String(tg.id);
    const existing = await this.userModel.findOne({ telegramUserId, authProvider: 'telegram' }).select({ roles: 1 }).exec();
    if (existing) {
      return { userId: existing._id.toString(), roles: (existing.roles ?? ['user']) as any };
    }

    
    
    const username = `tg${telegramUserId}`;

    const created = new this.userModel({
      username,
      passwordHash: null,
      authProvider: 'telegram',
      telegramUserId,
      roles: ['user'],
      balance: 0,
    });
    await created.save();

    return { userId: created._id.toString(), roles: ['user'] };
  }
}

