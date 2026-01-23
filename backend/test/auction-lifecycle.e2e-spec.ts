import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, http, loginAdmin, poll, registerUser, setupTestApp } from './_helpers';
import { RoundsProcessor } from '../src/rounds/rounds.processor';
import { Job } from 'bullmq';
import { CompleteRoundJobData } from '../src/common/types/queue.types';

jest.setTimeout(120_000);

type BidDto = { status: 'active' | 'refunded' | 'won' | 'lost' | 'transferred' };
type RoundDto = { _id: string; status: 'pending' | 'active' | 'completed'; roundNumber: number; endTime: string; extendedEndTime: string | null };

describe('Auction lifecycle (transfer + final refund) e2e', () => {
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

  it('completes with no active/transferred bids after completion (core invariant)', async () => {
    const api = http(app);
    const u1 = await registerUser(api);
    const u2 = await registerUser(api);
    const u3 = await registerUser(api);
    await depositMe(api, u1.accessToken, 50_000);
    await depositMe(api, u2.accessToken, 50_000);
    await depositMe(api, u3.accessToken, 50_000);

    const admin = await loginAdmin(api);

    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_LIFE_${Date.now()}`,
      description: 'transfer/final refund',
      totalRounds: 2,
      winnersPerRound: 1,
      roundDuration: 5,
      minBid: 100,
      minIncrement: 10,
      // Keep anti-sniping minimal (1s) to avoid long late windows; we still handle possible extension in completion wait.
      antiSnipingExtension: 1,
    });
    expect(create.status).toBe(201);
    const auctionId = create.body?._id as string;

    await api.post(`/api/auctions/${auctionId}/start`).set(authHeader(admin.accessToken)).send({}).expect(201);

    // Round 1 bids (3 bids -> 1 winner, others transferred)
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 200 }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u2.accessToken)).send({ amount: 300 }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u3.accessToken)).send({ amount: 250 }).expect(201);

    // Manually complete round 1 (avoid reliance on background worker in Jest)
    const r1 = (await api.get(`/api/auctions/${auctionId}/current-round`)).body as RoundDto;
    const ends1 = new Date(r1.extendedEndTime || r1.endTime).getTime();
    await new Promise((r) => setTimeout(r, Math.max(0, ends1 - Date.now() + 150)));
    await processor.process({ name: 'complete-round', data: { roundId: r1._id, auctionId } } as unknown as Job<CompleteRoundJobData>);

    // Round 2 may already be active or (in some environments) may even be completed quickly.
    // Resolve round2 id via /rounds to avoid flakiness.
    const roundsResp = await api.get(`/api/auctions/${auctionId}/rounds`);
    expect(roundsResp.status).toBe(200);
    const rounds = roundsResp.body as RoundDto[];
    const round2 = rounds.find((r) => r.roundNumber === 2) || null;
    if (round2) {
      const ends2 = new Date(round2.extendedEndTime || round2.endTime).getTime();
      await new Promise((r) => setTimeout(r, Math.max(0, ends2 - Date.now() + 150)));
      await processor.process({ name: 'complete-round', data: { roundId: round2._id, auctionId } } as unknown as Job<CompleteRoundJobData>);
    }

    // Ensure auction completed
    await poll(
      async () => {
        const a = await api.get(`/api/auctions/${auctionId}`);
        if (a.status !== 200) return null;
        return a.body?.status === 'completed' ? true : null;
      },
      { timeoutMs: 30_000, intervalMs: 250 },
    );

    const bidsPage = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 200 });
    expect(bidsPage.status).toBe(200);
    const bids = (bidsPage.body?.data as BidDto[]) || [];
    const stillActive = bids.filter((b) => b.status === 'active' || b.status === 'transferred');
    expect(stillActive.length).toBe(0);
    const refunded = bids.filter((b) => b.status === 'refunded');
    expect(refunded.length).toBeGreaterThanOrEqual(1);
  });
});

