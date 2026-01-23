import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { BaseRepository } from './base.repository';
import { Auction } from '../../auctions/schemas/auction.schema';
import { IAuction } from '../types/entities.types';

export interface IAuctionRepository {
  findById(id: string, session?: ClientSession): Promise<IAuction | null>;
  findByStatus(status: string, session?: ClientSession): Promise<IAuction[]>;
  findActive(session?: ClientSession): Promise<IAuction[]>;
  findDraftByCreator(userId: string, session?: ClientSession): Promise<IAuction | null>;
  findPage(
    filter: Record<string, any>,
    sort: Record<string, 1 | -1>,
    page: number,
    limit: number,
  ): Promise<{ data: IAuction[]; total: number }>;
  create(data: Partial<IAuction>, session?: ClientSession): Promise<IAuction>;
  updateById(id: string, update: Partial<IAuction>, session?: ClientSession): Promise<IAuction | null>;
  updateStatus(id: string, status: string, session?: ClientSession): Promise<IAuction | null>;
}

@Injectable()
export class AuctionRepository extends BaseRepository<IAuction> implements IAuctionRepository {
  constructor(@InjectModel(Auction.name) model: Model<Auction>) {
    super(model);
  }

  async findByStatus(status: string, session?: ClientSession): Promise<IAuction[]> {
    const query = this.model.find({ status });
    if (session) {
      query.session(session);
    }
    const docs = await query.lean().exec();
    return this.toDomainArray(docs);
  }

  async findActive(session?: ClientSession): Promise<IAuction[]> {
    return this.findByStatus('active', session);
  }

  async findDraftByCreator(userId: string, session?: ClientSession): Promise<IAuction | null> {
    const query = this.model.findOne({ createdBy: userId, status: 'draft' }).sort({ createdAt: -1 });
    if (session) {
      query.session(session);
    }
    const doc = await query.lean().exec();
    return this.toDomain(doc);
  }

  async findPage(
    filter: Record<string, any>,
    sort: Record<string, 1 | -1>,
    page: number,
    limit: number,
  ): Promise<{ data: IAuction[]; total: number }> {
    const skip = Math.max(0, (page - 1) * limit);
    const [data, total] = await Promise.all([
      this.model.find(filter).sort(sort).skip(skip).limit(limit).lean().exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { data: this.toDomainArray(data), total };
  }

  async updateStatus(id: string, status: string, session?: ClientSession): Promise<IAuction | null> {
    return this.updateById(id, { status } as Partial<IAuction>, session);
  }
}
