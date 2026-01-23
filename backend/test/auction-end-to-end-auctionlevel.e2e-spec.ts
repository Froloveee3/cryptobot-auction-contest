import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, getMe, http, loginAdmin, poll, registerUser, setupTestApp } from './_helpers';
import { RoundsProcessor } from '../src/rounds/rounds.processor';
import { Job } from 'bullmq';
import { CompleteRoundJobData } from '../src/common/types/queue.types';

jest.setTimeout(180_000);

type RoundDto = { _id: string; roundNumber: number; status: 'pending' | 'active' | 'completed'; endTime: string; extendedEndTime: string | null };
type BidDto = { id: string; userId: string; amount: number; status: string; giftNumber: number | null; wonRoundNumber: number | null };

describe('Auction: auction-level bids, losers stay active, winners get giftNumber, burn per round (e2e)', () => {
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

  it('runs 2 rounds: losers remain active into next rounds; totalGiftsDistributed burns per round', async () => {
    const api = http(app);
    const admin = await loginAdmin(api);

    const u1 = await registerUser(api);
    const u2 = await registerUser(api);
    const u3 = await registerUser(api);
    await depositMe(api, u1.accessToken, 100_000);
    await depositMe(api, u2.accessToken, 100_000);
    await depositMe(api, u3.accessToken, 100_000);

    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_AUCTIONLEVEL_${Date.now()}`,
      description: 'auction-level bids',
      totalRounds: 3,
      winnersPerRound: 2,
      roundDuration: 3,
      minBid: 10,
      minIncrement: 1,
      antiSnipingWindow: 1,
      antiSnipingExtension: 1,
      maxRoundExtensions: 0,
    });
    expect(create.status).toBe(201);
    const auctionId = create.body?._id as string;

    await api.post(`/api/auctions/${auctionId}/start`).set(authHeader(admin.accessToken)).send({}).expect(201);
    const r1 = await poll(
      async () => {
        const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
        if (rr.status !== 200) return null;
        const r = rr.body as RoundDto;
        return r.status === 'active' ? r : null;
      },
      { timeoutMs: 10_000, intervalMs: 200 },
    );

    // Three active bids
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 100, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u2.accessToken)).send({ amount: 90, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u3.accessToken)).send({ amount: 80, mode: 'new' }).expect(201);

    // Complete round 1
    const ends1 = new Date(r1.extendedEndTime || r1.endTime).getTime();
    await new Promise((r) => setTimeout(r, Math.max(0, ends1 - Date.now() + 150)));
    await processor.process({ name: 'complete-round', data: { roundId: r1._id, auctionId } } as unknown as Job<CompleteRoundJobData>);

    // totalGiftsDistributed burned by winnersPerRound (=2)
    const a1 = await api.get(`/api/auctions/${auctionId}`);
    expect(a1.status).toBe(200);
    expect(a1.body?.totalGiftsDistributed).toBe(2);

    // Two winners marked wonRoundNumber=1; one loser stays active
    const bids1 = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 200 });
    expect(bids1.status).toBe(200);
    const data1 = (bids1.body?.data as BidDto[]) || [];
    const won1 = data1.filter((b) => b.status === 'won' && b.wonRoundNumber === 1);
    const active1 = data1.filter((b) => b.status === 'active');
    expect(won1).toHaveLength(2);
    expect(active1).toHaveLength(1);

    // Round 2 must exist and be active
    const r2 = await poll(
      async () => {
        const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
        if (rr.status !== 200) return null;
        const r = rr.body as RoundDto;
        return r.status === 'active' && r.roundNumber === 2 ? r : null;
      },
      { timeoutMs: 20_000, intervalMs: 200 },
    );
    expect(r2._id).toBeTruthy();

    // Loser can raise in round 2 (still active)
    const loserBid = active1[0]!;
    const loserToken = loserBid.userId === (await getMe(api, u1.accessToken))._id ? u1.accessToken : loserBid.userId === (await getMe(api, u2.accessToken))._id ? u2.accessToken : u3.accessToken;
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(loserToken)).send({ amount: 50, mode: 'raise' }).expect(201);
  });
});

