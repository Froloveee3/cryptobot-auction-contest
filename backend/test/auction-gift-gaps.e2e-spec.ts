import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, http, loginAdmin, poll, registerUser, setupTestApp, sleep } from './_helpers';
import { RoundsProcessor } from '../src/rounds/rounds.processor';
import { Job } from 'bullmq';
import { CompleteRoundJobData } from '../src/common/types/queue.types';

jest.setTimeout(180_000);

type RoundDto = { _id: string; roundNumber: number; status: 'pending' | 'active' | 'completed'; endTime: string; extendedEndTime: string | null };
type BidDto = { id: string; userId: string; amount: number; status: string; giftNumber: number | null; wonRoundNumber: number | null };

describe('Auction: giftNumber gaps per round when not enough bids (e2e)', () => {
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

  it('burns winnersPerRound gifts each round and assigns giftNumber with gaps (example: 10 gifts/round)', async () => {
    const api = http(app);
    const admin = await loginAdmin(api);

    const users = await Promise.all([registerUser(api), registerUser(api), registerUser(api), registerUser(api), registerUser(api)]);
    await Promise.all(users.map((u) => depositMe(api, u.accessToken, 100_000)));

    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_GIFT_GAPS_${Date.now()}`,
      description: 'gift gaps',
      totalRounds: 10,
      winnersPerRound: 10,
      roundDuration: 2,
      minBid: 1,
      minIncrement: 1,
      antiSnipingWindow: 1,
      antiSnipingExtension: 1,
      maxRoundExtensions: 0,
    });
    expect(create.status).toBe(201);
    const auctionId = create.body?._id as string;

    await api.post(`/api/auctions/${auctionId}/start`).set(authHeader(admin.accessToken)).send({}).expect(201);

    // Round 1: only 3 bids => winners giftNumber should be 1..3, but totalGiftsDistributed becomes 10
    const r1 = (await api.get(`/api/auctions/${auctionId}/current-round`)).body as RoundDto;
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(users[0]!.accessToken)).send({ amount: 100, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(users[1]!.accessToken)).send({ amount: 90, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(users[2]!.accessToken)).send({ amount: 80, mode: 'new' }).expect(201);

    const ends1 = new Date(r1.extendedEndTime || r1.endTime).getTime();
    await sleep(Math.max(0, ends1 - Date.now() + 150));
    await processor.process({ name: 'complete-round', data: { roundId: r1._id, auctionId } } as unknown as Job<CompleteRoundJobData>);

    // Verify auction.totalGiftsDistributed == 10
    const a1 = await api.get(`/api/auctions/${auctionId}`);
    expect(a1.status).toBe(200);
    expect(a1.body?.totalGiftsDistributed).toBe(10);

    // Verify winners gift numbers 1..3
    const bids1 = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 200 });
    expect(bids1.status).toBe(200);
    const wonR1 = ((bids1.body?.data as BidDto[]) || []).filter((b) => b.status === 'won' && b.wonRoundNumber === 1);
    const giftsR1 = wonR1.map((b) => b.giftNumber).sort((x, y) => Number(x) - Number(y));
    expect(giftsR1).toEqual([1, 2, 3]);

    // Wait for round 2 active
    const r2 = await poll(
      async () => {
        const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
        if (rr.status !== 200) return null;
        const r = rr.body as RoundDto;
        return r.status === 'active' && r.roundNumber === 2 ? r : null;
      },
      { timeoutMs: 20_000, intervalMs: 200 },
    );

    // Round 2: only 2 bids => winners giftNumber should be 11,12 (because 4..10 are "unassigned")
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(users[3]!.accessToken)).send({ amount: 70, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(users[4]!.accessToken)).send({ amount: 60, mode: 'new' }).expect(201);

    const ends2 = new Date(r2.extendedEndTime || r2.endTime).getTime();
    await sleep(Math.max(0, ends2 - Date.now() + 150));
    await processor.process({ name: 'complete-round', data: { roundId: r2._id, auctionId } } as unknown as Job<CompleteRoundJobData>);

    const a2 = await api.get(`/api/auctions/${auctionId}`);
    expect(a2.status).toBe(200);
    expect(a2.body?.totalGiftsDistributed).toBe(20);

    const bids2 = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 500 });
    expect(bids2.status).toBe(200);
    const wonR2 = ((bids2.body?.data as BidDto[]) || []).filter((b) => b.status === 'won' && b.wonRoundNumber === 2);
    const giftsR2 = wonR2.map((b) => b.giftNumber).sort((x, y) => Number(x) - Number(y));
    expect(giftsR2).toEqual([11, 12]);
  });
});

