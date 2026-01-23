import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { OutboxEvent } from '../common/events/outbox/outbox-event.schema';
import { OutboxQueryDto } from './dto/outbox-query.dto';

export type OutboxListItem = {
  _id: string;
  eventId: string;
  eventType: string;
  status: string;
  attempts: number;
  lockedAt: Date | null;
  nextAttemptAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class OutboxAdminService {
  constructor(@InjectModel(OutboxEvent.name) private readonly model: Model<OutboxEvent>) {}

  async list(query: OutboxQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const filter: FilterQuery<OutboxEvent> = {};
    if (query.eventId) filter.eventId = query.eventId;
    if (query.eventType) filter.eventType = query.eventType;
    if (query.status) filter.status = query.status as any;

    const [total, docs] = await Promise.all([
      this.model.countDocuments(filter).exec(),
      this.model
        .find(filter)
        .select({
          eventId: 1,
          eventType: 1,
          status: 1,
          attempts: 1,
          lockedAt: 1,
          nextAttemptAt: 1,
          lastError: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const data: OutboxListItem[] = (docs as any[]).map((d) => ({ ...(d as any), _id: String(d._id) }));
    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async get(eventId: string): Promise<any | null> {
    const doc = await this.model.findOne({ eventId }).lean().exec();
    if (!doc) return null;
    return { ...(doc as any), _id: String((doc as any)._id) };
  }

  async retry(eventId: string): Promise<boolean> {
    const res = await this.model
      .updateOne(
        { eventId },
        {
          $set: { status: 'pending', lockedAt: null, nextAttemptAt: null, lastError: null },
        },
      )
      .exec();
    return (res as any).modifiedCount === 1;
  }
}

