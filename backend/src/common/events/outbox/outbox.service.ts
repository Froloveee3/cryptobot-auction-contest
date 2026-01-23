import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model } from 'mongoose';
import { OutboxEvent } from './outbox-event.schema';
import type { DomainEvent } from '../../services/event-bus.service';

@Injectable()
export class OutboxService {
  constructor(
    @InjectModel(OutboxEvent.name)
    private readonly model: Model<OutboxEvent>,
  ) {}

  async enqueue(
    event: DomainEvent,
    opts?: { session?: ClientSession; status?: OutboxEvent['status'] },
  ): Promise<void> {
    const status = opts?.status ?? 'pending';
    const doc: Partial<OutboxEvent> = {
      eventId: event.eventId!,
      eventType: event.eventType,
      eventVersion: event.eventVersion ?? 1,
      timestamp: event.timestamp,
      requestId: event.requestId ?? null,
      event,
      status,
      attempts: 0,
      lockedAt: null,
      nextAttemptAt: null,
      lastError: null,
    };

    await this.model.create([doc], opts?.session ? { session: opts.session } : undefined);
  }

  async claimNext(now: Date): Promise<OutboxEvent | null> {
    const filter: FilterQuery<OutboxEvent> = {
      status: 'pending',
      $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
    };

    return this.model
      .findOneAndUpdate(
        filter,
        {
          $set: { status: 'processing', lockedAt: now },
          $inc: { attempts: 1 },
        },
        { sort: { createdAt: 1, _id: 1 }, new: true },
      )
      .lean()
      .exec() as any;
  }

  async markPublished(eventId: string): Promise<void> {
    await this.model
      .updateOne({ eventId }, { $set: { status: 'published', lockedAt: null, lastError: null } })
      .exec();
  }

  async markFailed(eventId: string, params: { error: string; nextAttemptAt: Date | null }): Promise<void> {
    await this.model
      .updateOne(
        { eventId },
        {
          $set: {
            status: 'pending',
            lockedAt: null,
            lastError: params.error,
            nextAttemptAt: params.nextAttemptAt,
          },
        },
      )
      .exec();
  }

  async markDead(eventId: string, params: { error: string }): Promise<void> {
    await this.model
      .updateOne(
        { eventId },
        {
          $set: {
            status: 'failed',
            lockedAt: null,
            lastError: params.error,
            nextAttemptAt: null,
          },
        },
      )
      .exec();
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

