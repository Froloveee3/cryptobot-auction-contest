import { OutboxAdminService } from './outbox-admin.service';

describe('OutboxAdminService', () => {
  it('filters by status and eventType', async () => {
    const model = {
      countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(1) })),
      find: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ _id: '1', eventId: 'e1', eventType: 'X', status: 'failed' }]),
      })),
      findOne: jest.fn(() => ({ lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(null) })),
    } as any;

    const svc = new OutboxAdminService(model);
    const res = await svc.list({ status: 'failed', eventType: 'X', page: 1, limit: 50 } as any);

    expect(model.countDocuments).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', eventType: 'X' }));
    expect(res.total).toBe(1);
  });

  it('retry() sets status back to pending', async () => {
    const model = {
      updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) })),
      countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(0) })),
      find: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      })),
      findOne: jest.fn(() => ({ lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(null) })),
    } as any;

    const svc = new OutboxAdminService(model);
    const ok = await svc.retry('e1');

    expect(ok).toBe(true);
    expect(model.updateOne).toHaveBeenCalledWith(
      { eventId: 'e1' },
      { $set: { status: 'pending', lockedAt: null, nextAttemptAt: null, lastError: null } },
    );
  });
});

