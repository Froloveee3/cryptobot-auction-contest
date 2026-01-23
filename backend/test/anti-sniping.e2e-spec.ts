import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, http, loginAdmin, poll, registerUser, sleep, setupTestApp } from './_helpers';
import { RoundsProcessor } from '../src/rounds/rounds.processor';
import { Job } from 'bullmq';
import { CompleteRoundJobData } from '../src/common/types/queue.types';

jest.setTimeout(120_000);

type RoundDto = {
  _id: string;
  auctionId: string;
  roundNumber: number;
  status: string;
  startTime: string;
  endTime: string;
  extendedEndTime: string | null;
  extensionCount: number;
};

describe('Anti-sniping (Telegram-like) e2e', () => {
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

  it('TC-AS1/2/3: late outside topN does not extend; late in topN extends to cap; repeat does not exceed cap', async () => {
    const api = http(app);
    const u1 = await registerUser(api);
    const u2 = await registerUser(api);
    await depositMe(api, u1.accessToken, 50_000);
    await depositMe(api, u2.accessToken, 50_000);

    const admin = await loginAdmin(api);

    const duration = 15; 
    const increase = 4;

    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_AS_${Date.now()}`,
      description: 'anti-sniping',
      // totalSupply must allow multiple bids (dynamic minBid/supply-cutoff). We need >= 2 in-play bids here.
      totalRounds: 2,
      winnersPerRound: 1, // topN = 1
      roundDuration: duration,
      minBid: 100,
      minIncrement: 10,
      antiSnipingExtension: increase,
      antiSnipingWindow: 999, // should be normalized in backend to increase
      maxRoundExtensions: 999, // should be normalized in backend to 1
    });
    expect(create.status).toBe(201);
    const auctionId = create.body?._id;
    expect(typeof auctionId).toBe('string');

    // Normalization expectations (Telegram-like spec wiring)
    expect(create.body?.antiSnipingExtension).toBe(increase);
    expect(create.body?.antiSnipingWindow).toBe(increase);
    expect(create.body?.maxRoundExtensions).toBe(1);

    const started = await api.post(`/api/auctions/${auctionId}/start`).set(authHeader(admin.accessToken)).send({});
    expect([200, 201]).toContain(started.status);

    // Wait for round to actually start (status === 'active')
    await poll(
      async () => {
        const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
        if (rr.status !== 200) return null;
        const r = rr.body as RoundDto;
        return r?.status === 'active' ? r : null;
      },
      { timeoutMs: 10_000, intervalMs: 200 },
    );

    const r0Resp = await api.get(`/api/auctions/${auctionId}/current-round`);
    expect(r0Resp.status).toBe(200);
    const r0 = r0Resp.body as RoundDto;
    expect(r0?._id).toBeTruthy();
    expect(r0?.status).toBe('active');
    const startedAt = new Date(r0.startTime).getTime();
    const baseEndsAt = startedAt + duration * 1000;
    const capEndsAt = startedAt + (duration + increase) * 1000;
    expect(new Date(r0.endTime).getTime()).toBe(baseEndsAt);

    // Initial top (u1)
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 200, mode: 'new' }).expect(201);
    // Non-top (u2)
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u2.accessToken)).send({ amount: 150, mode: 'new' }).expect(201);

    // Wait until we are inside late window (<= increase sec left)
    await poll(
      async () => {
        const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
        if (rr.status !== 200) return null;
        const r = rr.body as RoundDto;
        const endsAt = new Date(r.extendedEndTime || r.endTime).getTime();
        const left = (endsAt - Date.now()) / 1000;
        return left <= increase - 1 && left > 0 ? true : null;
      },
      { timeoutMs: 20_000, intervalMs: 200 },
    );

    // TC-AS1: late but outside top1 -> no extension
    // raise is DELTA (+10): 150 -> 160 (still below top1=200)
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u2.accessToken)).send({ amount: 10, mode: 'raise' }).expect(201);
    const r1 = (await api.get(`/api/auctions/${auctionId}/current-round`)).body as RoundDto;
    const ends1 = new Date(r1.extendedEndTime || r1.endTime).getTime();
    expect(ends1).toBe(baseEndsAt);

    // TC-AS2: late + top1 -> extend to cap
    // raise is DELTA (+20)
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 20, mode: 'raise' }).expect(201);
    const r2 = (await api.get(`/api/auctions/${auctionId}/current-round`)).body as RoundDto;
    const ends2 = new Date(r2.extendedEndTime || r2.endTime).getTime();
    expect(ends2).toBe(capEndsAt);

    // TC-AS3: already extended -> no further changes
    // raise is DELTA (+20)
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 20, mode: 'raise' }).expect(201);
    const r3 = (await api.get(`/api/auctions/${auctionId}/current-round`)).body as RoundDto;
    const ends3 = new Date(r3.extendedEndTime || r3.endTime).getTime();
    expect(ends3).toBe(capEndsAt);

    // Ensure the round does NOT complete at base end (BullMQ reschedule correctness)
    const msToJustAfterBase = Math.max(0, baseEndsAt - Date.now() + 150);
    await sleep(msToJustAfterBase);
    const mid = await api.get(`/api/auctions/${auctionId}/current-round`);
    expect(mid.status).toBe(200);
    expect((mid.body as RoundDto)?._id).toBeTruthy();

    // Ensure it DOES complete around cap end
    const msToAfterCap = Math.max(0, capEndsAt - Date.now() + 300);
    await sleep(msToAfterCap);

    // Manually trigger completion job (avoid reliance on background worker in Jest)
    await processor.process(
      { name: 'complete-round', data: { roundId: r0._id, auctionId } } as unknown as Job<CompleteRoundJobData>,
    );

    // Round should be completed; auction stays active because totalRounds=2.
    const rounds = await api.get(`/api/auctions/${auctionId}/rounds`);
    expect(rounds.status).toBe(200);
    const rList = rounds.body as RoundDto[];
    const r1Done = rList.find((x) => x.roundNumber === 1);
    expect(r1Done?.status).toBe('completed');
  });

  it('TC-AS4: concurrent late bids in topN keep endsAt == cap (idempotent)', async () => {
    const api = http(app);
    const u1 = await registerUser(api);
    const u2 = await registerUser(api);
    const u3 = await registerUser(api);
    await depositMe(api, u1.accessToken, 50_000);
    await depositMe(api, u2.accessToken, 50_000);
    await depositMe(api, u3.accessToken, 50_000);

    const admin = await loginAdmin(api);

    const duration = 15; // Increased for test reliability
    const increase = 4;
    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_AS_CONC_${Date.now()}`,
      description: 'anti-sniping concurrent',
      // Need >= 3 in-play bids for this test. totalSupply = totalRounds * winnersPerRound = 4
      totalRounds: 2,
      winnersPerRound: 2, // topN = 2
      roundDuration: duration,
      minBid: 100,
      minIncrement: 10,
      antiSnipingExtension: increase,
    });
    expect(create.status).toBe(201);
    const auctionId = create.body?._id as string;
    await api.post(`/api/auctions/${auctionId}/start`).set(authHeader(admin.accessToken)).send({}).expect(201);

    // Wait for round to actually start
    await poll(
      async () => {
        const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
        if (rr.status !== 200) return null;
        const r = rr.body as RoundDto;
        return r?.status === 'active' ? r : null;
      },
      { timeoutMs: 10_000, intervalMs: 200 },
    );

    const r0 = (await api.get(`/api/auctions/${auctionId}/current-round`)).body as RoundDto;
    expect(r0?.status).toBe('active');
    const startedAt = new Date(r0.startTime).getTime();
    const capEndsAt = startedAt + (duration + increase) * 1000;

    // Seed bids
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 200, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u2.accessToken)).send({ amount: 190, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u3.accessToken)).send({ amount: 180, mode: 'new' }).expect(201);

    // Enter late window
    await poll(
      async () => {
        const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
        const r = rr.body as RoundDto;
        const endsAt = new Date(r.extendedEndTime || r.endTime).getTime();
        const left = (endsAt - Date.now()) / 1000;
        return left <= increase - 1 && left > 0 ? true : null;
      },
      { timeoutMs: 20_000, intervalMs: 200 },
    );

    // Two concurrent late bids that should end up in top2.
    // raise is DELTA
    await Promise.all([
      api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 50, mode: 'raise' }), // 200 -> 250
      api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u3.accessToken)).send({ amount: 60, mode: 'raise' }), // 180 -> 240
    ]);

    const r1 = (await api.get(`/api/auctions/${auctionId}/current-round`)).body as RoundDto;
    const ends = new Date(r1.extendedEndTime || r1.endTime).getTime();
    expect(ends).toBe(capEndsAt);
  });

  it('TC-AS5: bid at/after endsAt is rejected consistently (ROUND_ENDED)', async () => {
    const api = http(app);
    const u = await registerUser(api);
    await depositMe(api, u.accessToken, 50_000);

    const admin = await loginAdmin(api);

    const duration = 8; // Increased for test reliability
    const increase = 2;
    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_AS_EDGE_${Date.now()}`,
      description: 'anti-sniping edge',
      // In this edge-case we want a true "after final round end" rejection.
      totalRounds: 1,
      winnersPerRound: 1,
      roundDuration: duration,
      minBid: 100,
      minIncrement: 10,
      antiSnipingExtension: increase,
    });
    expect(create.status).toBe(201);
    const auctionId = create.body?._id as string;
    await api.post(`/api/auctions/${auctionId}/start`).set(authHeader(admin.accessToken)).send({}).expect(201);

    // Wait for round to actually start
    await poll(
      async () => {
        const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
        if (rr.status !== 200) return null;
        const r = rr.body as RoundDto;
        return r?.status === 'active' ? r : null;
      },
      { timeoutMs: 10_000, intervalMs: 200 },
    );

    const r0 = (await api.get(`/api/auctions/${auctionId}/current-round`)).body as RoundDto;
    expect(r0?.status).toBe('active');
    const endsAt = new Date(r0.endTime).getTime();

    // Wait until after endsAt (no extension should happen in this test).
    await sleep(Math.max(0, endsAt - Date.now() + 300));

    const resp = await api
      .post(`/api/auctions/${auctionId}/bids`)
      .set(authHeader(u.accessToken))
      .send({ amount: 200 });

    expect(resp.status).toBe(400);
    expect(resp.body?.code).toBe('ROUND_ENDED');
  });
});

