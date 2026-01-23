import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, Types } from 'mongoose';
import { BaseRepository } from './base.repository';
import { Bid } from '../../bids/schemas/bid.schema';
import { IBid } from '../types/entities.types';

export interface IBidRepository {
  findById(id: string, session?: ClientSession): Promise<IBid | null>;
  findByAuctionId(auctionId: string, session?: ClientSession): Promise<IBid[]>;
  findByUserId(userId: string, session?: ClientSession): Promise<IBid[]>;
  findActiveByAuctionId(auctionId: string, session?: ClientSession): Promise<IBid[]>;
  findActiveByUserInAuction(userId: string, auctionId: string, session?: ClientSession): Promise<IBid | null>;
  create(data: Partial<IBid>, session?: ClientSession): Promise<IBid>;
  updateById(id: string, update: Partial<IBid>, session?: ClientSession): Promise<IBid | null>;
  bulkUpdateStatus(bidIds: string[], status: string, session?: ClientSession): Promise<number>;
}

@Injectable()
export class BidRepository extends BaseRepository<IBid> implements IBidRepository {
  constructor(@InjectModel(Bid.name) model: Model<Bid>) {
    super(model);
  }

  async findByAuctionId(auctionId: string, session?: ClientSession): Promise<IBid[]> {
    const query = this.model.find({ auctionId });
    if (session) {
      query.session(session);
    }
    const docs = await query.lean().exec();
    return this.toDomainArray(docs);
  }

  async findByUserId(userId: string, session?: ClientSession): Promise<IBid[]> {
    const query = this.model.find({ userId });
    if (session) {
      query.session(session);
    }
    const docs = await query.lean().exec();
    return this.toDomainArray(docs);
  }

  async findActiveByAuctionId(auctionId: string, session?: ClientSession): Promise<IBid[]> {
    const query = this.model
      .find({ auctionId, status: 'active' })
      .sort({ amount: -1, timestamp: 1 })
      .lean();
    if (session) query.session(session);
    const docs = await query.exec();
    return this.toDomainArray(docs);
  }

  async findActiveByUserInAuction(userId: string, auctionId: string, session?: ClientSession): Promise<IBid | null> {
    const query = this.model.findOne({ userId, auctionId, status: 'active' }).lean();
    if (session) query.session(session);
    const doc = await query.exec();
    return doc ? this.toDomain(doc) : null;
  }

  async bulkUpdateStatus(bidIds: string[], status: string, session?: ClientSession): Promise<number> {
    const result = await this.model.bulkWrite(
      bidIds.map((bidId) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(bidId) },
          update: { $set: { status } },
        },
      })),
      session ? { session } : {},
    );
    return result.modifiedCount;
  }
}
