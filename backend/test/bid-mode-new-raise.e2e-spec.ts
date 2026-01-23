import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, http, loginAdmin, poll, registerUser, setupTestApp } from './_helpers';

jest.setTimeout(120_000);

describe('Bids: mode=new vs mode=raise (auction-level) (e2e)', () => {
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

  it('mode=new is rejected if user already has active bid; mode=raise is rejected if no active bid', async () => {
    const api = http(app);
    const admin = await loginAdmin(api);
    const u = await registerUser(api);
    await depositMe(api, u.accessToken, 50_000);

    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_MODE_${Date.now()}`,
      description: 'mode new/raise',
      totalRounds: 2,
      winnersPerRound: 1,
      roundDuration: 30,
      minBid: 10,
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

    // raise without active bid => reject
    const badRaise = await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u.accessToken)).send({ amount: 5, mode: 'raise' });
    expect(badRaise.status).toBe(400);
    expect(badRaise.body?.code).toBe('NO_ACTIVE_BID_TO_RAISE');

    // new ok
    const first = await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u.accessToken)).send({ amount: 20, mode: 'new' });
    expect(first.status).toBe(201);

    // second new forbidden (active exists)
    const badNew = await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u.accessToken)).send({ amount: 30, mode: 'new' });
    expect(badNew.status).toBe(400);
    expect(badNew.body?.code).toBe('NEW_BID_NOT_ALLOWED_WHEN_ACTIVE_EXISTS');

    // raise ok (delta)
    const raise = await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u.accessToken)).send({ amount: 5, mode: 'raise' });
    expect(raise.status).toBe(201);
    expect(raise.body?.amount).toBe(25);
  });
});

