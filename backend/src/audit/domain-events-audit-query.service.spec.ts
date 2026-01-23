import { DomainEventsAuditQueryService } from './domain-events-audit-query.service';

describe('DomainEventsAuditQueryService', () => {
  it('builds filter and returns paginated response', async () => {
    const model = {
      countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(2) })),
      find: jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          { _id: '1', eventId: 'e1', eventVersion: 1, eventType: 'BidPlacedEvent', createdAt: new Date(), timestamp: new Date() },
          { _id: '2', eventId: 'e2', eventVersion: 1, eventType: 'RoundEndedEvent', createdAt: new Date(), timestamp: new Date() },
        ]),
      })),
      findById: jest.fn(() => ({ lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(null) })),
    } as any;

    const svc = new DomainEventsAuditQueryService(model);

    const res = await svc.list({
      eventType: 'BidPlacedEvent',
      auctionId: 'a1',
      page: 1,
      limit: 50,
    } as any);

    expect(model.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'BidPlacedEvent', auctionId: 'a1' }),
    );
    expect(res.total).toBe(2);
    expect(res.totalPages).toBe(1);
    expect(res.data[0]!._id).toBe('1');
  });

  it('getById returns null when not found', async () => {
    const model = {
      findById: jest.fn(() => ({ lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(null) })),
    } as any;
    const svc = new DomainEventsAuditQueryService(model);
    expect(await svc.getById('x')).toBeNull();
  });
});

