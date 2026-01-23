import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DomainEventAudit } from './schemas/domain-event-audit.schema';

@Injectable()
export class DomainEventsAuditService {
  constructor(
    @InjectModel(DomainEventAudit.name)
    private readonly model: Model<DomainEventAudit>,
  ) {}

  async append(entry: Omit<DomainEventAudit, 'createdAt' | 'updatedAt'>): Promise<void> {
    await this.model.create(entry);
  }
}

