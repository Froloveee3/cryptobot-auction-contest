import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { DomainEventAudit } from './schemas/domain-event-audit.schema';
import { AuditEventsQueryDto } from './dto/audit-events-query.dto';

export type AuditEventListItem = {
  _id: string;
  eventId: string;
  eventType: string;
  eventVersion: number;
  timestamp: Date;
  requestId: string | null;
  auctionId: string | null;
  roundId: string | null;
  bidId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
};

@Injectable()
export class DomainEventsAuditQueryService {
  constructor(
    @InjectModel(DomainEventAudit.name)
    private readonly model: Model<DomainEventAudit>,
  ) {}

  async getById(id: string): Promise<AuditEventListItem | null> {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) return null;
    return {
      ...(doc as any),
      _id: String((doc as any)._id),
    };
  }

  async list(query: AuditEventsQueryDto): Promise<{
    data: AuditEventListItem[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const filter: FilterQuery<DomainEventAudit> = {};
    if (query.eventId) filter.eventId = query.eventId;
    if (query.eventType) filter.eventType = query.eventType;
    if (query.requestId) filter.requestId = query.requestId;
    if (query.auctionId) filter.auctionId = query.auctionId;
    if (query.roundId) filter.roundId = query.roundId;
    if (query.bidId) filter.bidId = query.bidId;

    if (query.from || query.to) {
      const createdAt: any = {};
      if (query.from) createdAt.$gte = new Date(query.from);
      if (query.to) createdAt.$lte = new Date(query.to);
      filter.createdAt = createdAt;
    }

    const [total, docs] = await Promise.all([
      this.model.countDocuments(filter).exec(),
      this.model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const data: AuditEventListItem[] = (docs as any[]).map((d) => ({
      ...(d as any),
      _id: String(d._id),
    }));

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}

