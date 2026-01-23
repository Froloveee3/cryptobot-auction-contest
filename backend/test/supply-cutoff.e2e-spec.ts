import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, http, loginAdmin, poll, registerUser, setupTestApp } from './_helpers';
import { RoundsProcessor } from '../src/rounds/rounds.processor';
import { Job } from 'bullmq';
import { CompleteRoundJobData } from '../src/common/types/queue.types';

jest.setTimeout(120_000);

type BidDto = { amount: number; status: 'active' | 'refunded' | 'won' };
type RoundDto = { _id: string; status: 'pending' | 'active' | 'completed'; roundNumber: number; endTime: string; extendedEndTime: string | null };

describe('Supply-cutoff (immediate refund) e2e', () => {
  let app: INestApplication;
  let processor: RoundsProcessor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await setupTestApp(app);
    await app.init();
    processor = moduleRef.get(RoundsProcessor);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('refunds bids outside remaining supply immediately (during bidding) and keeps them refunded after round completion', async () => {
    const api = http(app);

    const users = await Promise.all([
      registerUser(api),
      registerUser(api),
      registerUser(api),
      registerUser(api),
      registerUser(api),
    ]);
    await Promise.all(users.map((u) => depositMe(api, u.accessToken, 50_000)));

    const admin = await loginAdmin(api);

    
    
    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_CUTOFF_${Date.now()}`,
      description: 'supply cutoff immediate refund',
      totalRounds: 3,
      winnersPerRound: 1,
      roundDuration: 4,
      minBid: 100,
      minIncrement: 10,
      // keep late-window minimal to reduce flakiness
      antiSnipingExtension: 1,
    });
    expect(create.status).toBe(201);
    const auctionId = create.body?._id as string;

    await api.post(`/api/auctions/${auctionId}/start`).set(authHeader(admin.accessToken)).send({}).expect(201);

    // amounts ensure deterministic ranking AND ensure every new bid can enter top3 (so request is accepted)
    // remainingSupply=3 => when full, minBid becomes cutoff+minIncrement.
    const amounts = [500, 400, 300, 310, 320];
    for (let i = 0; i < users.length; i += 1) {
      const u = users[i]!;
      // eslint-disable-next-line no-await-in-loop
      await api
        .post(`/api/auctions/${auctionId}/bids`)
        .set(authHeader(u.accessToken))
        .send({ amount: amounts[i], mode: 'new' })
        .expect(201);
    }

    // Manually complete round 1 (avoid reliance on background worker in Jest)
    const r1 = (await api.get(`/api/auctions/${auctionId}/current-round`)).body as RoundDto;
    const ends1 = new Date(r1.extendedEndTime || r1.endTime).getTime();
    await new Promise((r) => setTimeout(r, Math.max(0, ends1 - Date.now() + 150)));
    await processor.process({ name: 'complete-round', data: { roundId: r1._id, auctionId } } as unknown as Job<CompleteRoundJobData>);

    // Auction should still be active after round 1 (since we have future rounds and supply remaining)
    await poll(
      async () => {
        const a = await api.get(`/api/auctions/${auctionId}`);
        if (a.status !== 200) return null;
        return a.body?.status === 'active' ? true : null;
      },
      { timeoutMs: 30_000, intervalMs: 250 },
    );

    const bidsPage = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 200 });
    expect(bidsPage.status).toBe(200);
    const bids = (bidsPage.body?.data as BidDto[]) || [];

    const won = bids.filter((b) => b.status === 'won');
    const active = bids.filter((b) => b.status === 'active');
    const refunded = bids.filter((b) => b.status === 'refunded');

    expect(won).toHaveLength(1);
    expect(active).toHaveLength(2);
    expect(refunded).toHaveLength(2);

    // Highest amount should win; two displaced bids should be refunded (cannot fit into remaining supply at bidding time)
    expect(won[0]?.amount).toBe(500);
    const refundedAmounts = refunded.map((b) => b.amount).sort((a, b) => a - b);
    expect(refundedAmounts).toEqual([300, 310]);
  });
});

