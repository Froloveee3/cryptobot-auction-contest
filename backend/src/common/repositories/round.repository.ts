import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { BaseRepository } from './base.repository';
import { Round } from '../../rounds/schemas/round.schema';
import { IRound } from '../types/entities.types';

export interface IRoundRepository {
  findById(id: string, session?: ClientSession): Promise<IRound | null>;
  findByAuctionId(auctionId: string, session?: ClientSession): Promise<IRound[]>;
  findActiveByAuctionId(auctionId: string, session?: ClientSession): Promise<IRound | null>;
  findActiveByAuctionIds(auctionIds: string[], session?: ClientSession): Promise<IRound[]>;
  findByAuctionAndNumber(auctionId: string, roundNumber: number, session?: ClientSession): Promise<IRound | null>;
  create(data: Partial<IRound>, session?: ClientSession): Promise<IRound>;
  updateById(id: string, update: Partial<IRound>, session?: ClientSession): Promise<IRound | null>;
  updateStatus(id: string, status: string, session?: ClientSession): Promise<IRound | null>;
}

@Injectable()
export class RoundRepository extends BaseRepository<IRound> implements IRoundRepository {
  constructor(@InjectModel(Round.name) model: Model<Round>) {
    super(model);
  }

  async findByAuctionId(auctionId: string, session?: ClientSession): Promise<IRound[]> {
    const query = this.model.find({ auctionId }).sort({ roundNumber: 1 });
    if (session) {
      query.session(session);
    }
    const docs = await query.lean().exec();
    return this.toDomainArray(docs);
  }

  async findActiveByAuctionId(auctionId: string, session?: ClientSession): Promise<IRound | null> {
    const query = this.model.findOne({ auctionId, status: 'active' });
    if (session) {
      query.session(session);
    }
    const doc = await query.lean().exec();
    return this.toDomain(doc);
  }

  async findActiveByAuctionIds(auctionIds: string[], session?: ClientSession): Promise<IRound[]> {
    if (!auctionIds.length) return [];
    const query = this.model.find({ auctionId: { $in: auctionIds }, status: 'active' });
    if (session) {
      query.session(session);
    }
    const docs = await query.lean().exec();
    return this.toDomainArray(docs);
  }

  async findByAuctionAndNumber(auctionId: string, roundNumber: number, session?: ClientSession): Promise<IRound | null> {
    const query = this.model.findOne({ auctionId, roundNumber });
    if (session) {
      query.session(session);
    }
    const doc = await query.lean().exec();
    return this.toDomain(doc);
  }

  async updateStatus(id: string, status: string, session?: ClientSession): Promise<IRound | null> {
    return this.updateById(id, { status } as Partial<IRound>, session);
  }
}
