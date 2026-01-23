import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, getMe, http, loginAdmin, poll, registerUser, setupTestApp } from './_helpers';

jest.setTimeout(180_000);

type ApiError = { code: string; message: string; details?: any };
type BidDto = { id: string; userId: string; amount: number; status: string };

describe('Auction: dynamic minBid + supply-cutoff at accept-time (e2e)', () => {
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

  it('rejects new bid when dynamicMinBid moved above the user bid; refunds displaced bids immediately', async () => {
    const api = http(app);
    const admin = await loginAdmin(api);

    
    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_MINBID_${Date.now()}`,
      description: 'dynamic minbid',
      totalRounds: 2,
      winnersPerRound: 1,
      roundDuration: 30,
      minBid: 100,
      minIncrement: 1,
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
        return rr.body?.status === 'active' ? true : null;
      },
      { timeoutMs: 10_000, intervalMs: 200 },
    );

    const u1 = await registerUser(api);
    const u2 = await registerUser(api);
    const u3 = await registerUser(api);
    await depositMe(api, u1.accessToken, 50_000);
    await depositMe(api, u2.accessToken, 50_000);
    await depositMe(api, u3.accessToken, 50_000);

    const b1 = await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 200, mode: 'new' });
    expect(b1.status).toBe(201);

    const before2 = await getMe(api, u2.accessToken);
    const b2 = await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u2.accessToken)).send({ amount: 201, mode: 'new' });
    expect(b2.status).toBe(201);
    // remainingSupply=2, now 2 active bids => dynamicMinBid becomes (cutoff + minIncrement).
    // cutoff is the 2nd bid among top2 => 200 (u1), so dynamicMinBid should be 201.
    // Now we accept a higher bid and displace the cutoff.
    const before3 = await getMe(api, u3.accessToken);
    const b3 = await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u3.accessToken)).send({ amount: 202, mode: 'new' });
    expect(b3.status).toBe(201);

    // After displacement, one of previous bids must be refunded immediately (active bids <= remainingSupply).
    const bids = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 200 });
    expect(bids.status).toBe(200);
    const data = (bids.body?.data as BidDto[]) || [];
    const active = data.filter((x) => x.status === 'active');
    const refunded = data.filter((x) => x.status === 'refunded');
    expect(active.length).toBeLessThanOrEqual(2);
    expect(refunded.length).toBeGreaterThanOrEqual(1);

    // One of u1/u2 should have been refunded due to cutoff.
    const after2 = await getMe(api, u2.accessToken);
    const after3 = await getMe(api, u3.accessToken);
    // u3 locked 202 once
    expect(after3.balance).toBe(before3.balance - 202);
    // u2 either remains active (locked) or got refunded (balance back)
    expect([before2.balance, before2.balance - 201]).toContain(after2.balance);

    // Now dynamicMinBid should be >= 202. A fresh user placing below it should be rejected with BID_TOO_LOW.
    const u4 = await registerUser(api);
    await depositMe(api, u4.accessToken, 50_000);
    const bad = await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u4.accessToken)).send({ amount: 201, mode: 'new' });
    expect(bad.status).toBe(400);
    expect((bad.body as ApiError).code).toBe('BID_TOO_LOW');
    expect(Number((bad.body as ApiError).details?.minBid)).toBeGreaterThanOrEqual(202);
  });
});

