import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, getMe, http, loginAdmin, poll, registerUser, setupTestApp } from './_helpers';
import { RoundsProcessor } from '../src/rounds/rounds.processor';
import { Job } from 'bullmq';
import { CompleteRoundJobData } from '../src/common/types/queue.types';

jest.setTimeout(180_000);

type RoundDto = { _id: string; roundNumber: number };
type TransactionsPage = { total: number };

describe('Idempotency e2e (re-processing completion job does not duplicate financial effects)', () => {
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

  it('re-enqueuing complete-round for an already completed round does not change transaction history', async () => {
    const api = http(app);
    const admin = await loginAdmin(api);

    const u1 = await registerUser(api);
    const u2 = await registerUser(api);
    await depositMe(api, u1.accessToken, 50_000);
    await depositMe(api, u2.accessToken, 50_000);
    const me1 = await getMe(api, u1.accessToken);
    const me2 = await getMe(api, u2.accessToken);

    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_IDEMP_${Date.now()}`,
      description: 'idempotent completion',
      totalRounds: 1,
      winnersPerRound: 1,
      roundDuration: 5,
      minBid: 100,
      minIncrement: 1,
      antiSnipingExtension: 1,
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

    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 200 }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u2.accessToken)).send({ amount: 300 }).expect(201);

    // Manually complete round to ensure deterministic completion in Jest.
    const current = await api.get(`/api/auctions/${auctionId}/current-round`);
    expect(current.status).toBe(200);
    const r0 = current.body as unknown as { _id: string; endTime: string; extendedEndTime: string | null };
    const endsAt = new Date(r0.extendedEndTime || r0.endTime).getTime();
    await new Promise((r) => setTimeout(r, Math.max(0, endsAt - Date.now() + 150)));
    await processor.process({ name: 'complete-round', data: { roundId: r0._id, auctionId } } as unknown as Job<CompleteRoundJobData>);

    const roundsResp = await api.get(`/api/auctions/${auctionId}/rounds`);
    expect(roundsResp.status).toBe(200);
    const rounds = roundsResp.body as RoundDto[];
    const r1 = rounds.find((r) => r.roundNumber === 1);
    expect(r1?._id).toBeTruthy();
    const roundId = r1!._id;

    const before1 = await api
      .get(`/api/users/${me1._id}/transactions`)
      .set(authHeader(admin.accessToken))
      .query({ page: 1, limit: 2000 });
    expect(before1.status).toBe(200);
    const before2 = await api
      .get(`/api/users/${me2._id}/transactions`)
      .set(authHeader(admin.accessToken))
      .query({ page: 1, limit: 2000 });
    expect(before2.status).toBe(200);

    const beforeCount1 = (before1.body as TransactionsPage).total;
    const beforeCount2 = (before2.body as TransactionsPage).total;

    // Re-run completion handler for already-completed round (should noop early).
    await processor.process({ name: 'complete-round', data: { roundId, auctionId } } as unknown as Job<CompleteRoundJobData>);

    const after1 = await api
      .get(`/api/users/${me1._id}/transactions`)
      .set(authHeader(admin.accessToken))
      .query({ page: 1, limit: 2000 });
    expect(after1.status).toBe(200);
    const after2 = await api
      .get(`/api/users/${me2._id}/transactions`)
      .set(authHeader(admin.accessToken))
      .query({ page: 1, limit: 2000 });
    expect(after2.status).toBe(200);

    expect((after1.body as TransactionsPage).total).toBe(beforeCount1);
    expect((after2.body as TransactionsPage).total).toBe(beforeCount2);
  });
});

