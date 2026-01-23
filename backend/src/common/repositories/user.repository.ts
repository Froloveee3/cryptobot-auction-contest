import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { BaseRepository } from './base.repository';
import { User } from '../../users/schemas/user.schema';
import { IUser } from '../types/entities.types';

export interface IUserRepository {
  findById(id: string, session?: ClientSession): Promise<IUser | null>;
  findByUsername(username: string, session?: ClientSession): Promise<IUser | null>;
  findByTelegramId(telegramUserId: string, session?: ClientSession): Promise<IUser | null>;
  create(data: Partial<IUser>, session?: ClientSession): Promise<IUser>;
  updateById(id: string, update: Partial<IUser>, session?: ClientSession): Promise<IUser | null>;
  updateBalance(userId: string, amount: number, session?: ClientSession): Promise<IUser | null>;
}

@Injectable()
export class UserRepository extends BaseRepository<IUser> implements IUserRepository {
  constructor(@InjectModel(User.name) model: Model<User>) {
    super(model);
  }

  async findByUsername(username: string, session?: ClientSession): Promise<IUser | null> {
    const query = this.model.findOne({ username });
    if (session) {
      query.session(session);
    }
    const doc = await query.lean().exec();
    return this.toDomain(doc);
  }

  async findByTelegramId(telegramUserId: string, session?: ClientSession): Promise<IUser | null> {
    const query = this.model.findOne({ telegramUserId });
    if (session) {
      query.session(session);
    }
    const doc = await query.lean().exec();
    return this.toDomain(doc);
  }

  async updateBalance(userId: string, amount: number, session?: ClientSession): Promise<IUser | null> {
    const query = this.model.findByIdAndUpdate(userId, { $inc: { balance: amount } }, { new: true });
    if (session) {
      query.session(session);
    }
    const doc = await query.lean().exec();
    return this.toDomain(doc);
  }
}
