import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, getMe, http, loginAdmin, poll, registerUser, setupTestApp, sleep } from './_helpers';

jest.setTimeout(180_000);

type RoundDto = { _id: string; roundNumber: number; status: 'pending' | 'active' | 'completed'; endTime: string; extendedEndTime: string | null };

describe('Bids: raise after round end (winner rejects, loser accepts) (e2e)', () => {
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

  it('winner case: after round end, raise is rejected because bid becomes won', async () => {
    const api = http(app);
    const u1 = await registerUser(api);
    const u2 = await registerUser(api);
    await depositMe(api, u1.accessToken, 50_000);
    await depositMe(api, u2.accessToken, 50_000);

    const admin = await loginAdmin(api);
    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_RAISE_ENDED_${Date.now()}`,
      description: 'raise ended should reject, no next-round bleed',
      totalRounds: 2,
      winnersPerRound: 1,
      roundDuration: 2,
      minBid: 100,
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

    // u1 bids higher => u1 should WIN round 1
    const first = await api
      .post(`/api/auctions/${auctionId}/bids`)
      .set(authHeader(u1.accessToken))
      .send({ amount: 200, mode: 'new' });
    expect(first.status).toBe(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u2.accessToken)).send({ amount: 150, mode: 'new' }).expect(201);

    const before = await getMe(api, u1.accessToken);

    // Wait until after round1 endsAt; during this window the backend may not have created round2 yet.
    const endsAt = new Date(r1.extendedEndTime || r1.endTime).getTime();
    await sleep(Math.max(0, endsAt - Date.now() + 200));

    // Try to raise (delta +150) AFTER the round ended.
    const raise = await api
      .post(`/api/auctions/${auctionId}/bids`)
      .set(authHeader(u1.accessToken))
      .send({ amount: 150, mode: 'raise' });
    expect(raise.status).toBe(400);
    expect(raise.body?.code).toBe('NO_ACTIVE_BID_TO_RAISE');

    // Ensure no extra funds were locked for the raise attempt.
    const after = await getMe(api, u1.accessToken);
    expect(after.balance).toBe(before.balance);

    const bids = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 500 });
    expect(bids.status).toBe(200);
    const data = (bids.body?.data as any[]) || [];
    // Ensure u1 bid is now won (no active bid exists to raise)
    expect(data.some((b) => b.userId === first.body?.userId && b.status === 'won')).toBe(true);
  });

  it('loser case: after round end, raise is accepted because bid remains active', async () => {
    const api = http(app);
    const u1 = await registerUser(api);
    const u2 = await registerUser(api);
    await depositMe(api, u1.accessToken, 50_000);
    await depositMe(api, u2.accessToken, 50_000);

    const admin = await loginAdmin(api);
    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_RAISE_ENDED_LOSER_${Date.now()}`,
      description: 'raise after end should accept if bid still active',
      totalRounds: 2,
      winnersPerRound: 1,
      roundDuration: 2,
      minBid: 100,
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

    // u1 bids lower, u2 bids higher => u1 should LOSE and remain active for next rounds
    const first = await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 150, mode: 'new' });
    expect(first.status).toBe(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u2.accessToken)).send({ amount: 200, mode: 'new' }).expect(201);

    const before = await getMe(api, u1.accessToken);
    const endsAt = new Date(r1.extendedEndTime || r1.endTime).getTime();
    await sleep(Math.max(0, endsAt - Date.now() + 200));

    // Raise AFTER round end should still be applied if bid stayed active
    const raise = await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 60, mode: 'raise' });
    expect(raise.status).toBe(201);
    expect(raise.body?.amount).toBe(210); // 150 + 60

    const after = await getMe(api, u1.accessToken);
    expect(after.balance).toBe(before.balance - 60); // lock only delta
  });
});

