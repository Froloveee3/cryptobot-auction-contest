import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, http, loginAdmin, poll, registerUser, setupTestApp } from './_helpers';

jest.setTimeout(120_000);

type RoundDto = { _id: string; status: 'pending' | 'active' | 'completed'; endTime: string; extendedEndTime: string | null };

describe('Bids: raise in the same round (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await setupTestApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('re-posting /bids in the same round updates amount and response matches persisted bid', async () => {
    const api = http(app);
    const user = await registerUser(api);
    await depositMe(api, user.accessToken, 50_000);
    const admin = await loginAdmin(api);

    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_RAISE_${Date.now()}`,
      description: 'raise same round',
      totalRounds: 1,
      winnersPerRound: 50, // big supply => dynamic minBid shouldn't block raise
      roundDuration: 30, // ensure we stay in the same round
      minBid: 1,
      minIncrement: 1,
      // disable/limit anti-sniping to keep timing stable
      antiSnipingWindow: 1,
      antiSnipingExtension: 1,
      maxRoundExtensions: 0,
    });
    expect(create.status).toBe(201);
    const auctionId = create.body?._id as string;

    await api.post(`/api/auctions/${auctionId}/start`).set(authHeader(admin.accessToken)).send({}).expect(201);

    await poll(
      async () => {
        const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
        if (rr.status !== 200) return null;
        const r = rr.body as RoundDto;
        return r.status === 'active' ? r : null;
      },
      { timeoutMs: 10_000, intervalMs: 200 },
    );

    const bid1 = await api
      .post(`/api/auctions/${auctionId}/bids`)
      .set(authHeader(user.accessToken))
      .send({ amount: 10, mode: 'new' });
    expect(bid1.status).toBe(201);
    expect(bid1.body?.amount).toBe(10);
    const bidId = bid1.body?._id as string;
    expect(typeof bidId).toBe('string');

    const bid2 = await api
      .post(`/api/auctions/${auctionId}/bids`)
      .set(authHeader(user.accessToken))
      // Raise is DELTA (+10), not absolute target
      .send({ amount: 10, mode: 'raise' });
    expect(bid2.status).toBe(201);
    // Raise should keep same bid id in the same round
    expect(bid2.body?._id).toBe(bidId);
    expect(bid2.body?.amount).toBe(20);

    // Verify persisted data via list endpoint: there must be one in-play bid for this user in this round with amount=20
    const bidsPage = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 200 });
    expect(bidsPage.status).toBe(200);
    const data = (bidsPage.body?.data as any[]) || [];
    const mine = data.find((b) => b.userId === (bid1.body?.userId as string));
    expect(mine).toBeTruthy();
    const updated = mine!;
    expect(updated.amount).toBe(20);
  });
});

