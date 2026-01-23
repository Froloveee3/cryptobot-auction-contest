import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, getMe, http, loginAdmin, poll, registerUser, setupTestApp } from './_helpers';
import { RoundsProcessor } from '../src/rounds/rounds.processor';
import { Job } from 'bullmq';
import { CompleteRoundJobData } from '../src/common/types/queue.types';

jest.setTimeout(120_000);

type RoundDto = {
  _id: string;
  status: 'pending' | 'active' | 'completed';
  roundNumber: number;
};

type ApiError = { code: string; message: string };
type AuditIssue = { message: string };
type AuditResult = { issues: AuditIssue[] };

describe('Bid increment (increase) e2e', () => {
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

  it('enforces minIncrement relative to max previous bid of the user in the same round', async () => {
    const api = http(app);
    const admin = await loginAdmin(api);

    const u1 = await registerUser(api);
    const u2 = await registerUser(api);
    await depositMe(api, u1.accessToken, 50_000);
    await depositMe(api, u2.accessToken, 50_000);
    const me1 = await getMe(api, u1.accessToken);
    const me2 = await getMe(api, u2.accessToken);
    const startBal1 = me1.balance;
    const startBal2 = me2.balance;

    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_INC_${Date.now()}`,
      description: 'minIncrement',
      // Keep totalSupply high so dynamic minBid does not interfere with increment semantics
      totalRounds: 20,
      winnersPerRound: 1,
      roundDuration: 6,
      minBid: 100,
      minIncrement: 10,
      antiSnipingExtension: 1,
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

    // First bid ok
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 200, mode: 'new' }).expect(201);
    const after200 = await getMe(api, u1.accessToken);
    expect(after200.balance).toBe(startBal1 - 200);

    // Too small increase: delta=5 (increment 5 < 10) => 400 BID_INCREMENT_TOO_LOW
    const tooLow = await api
      .post(`/api/auctions/${auctionId}/bids`)
      .set(authHeader(u1.accessToken))
      .send({ amount: 5, mode: 'raise' });
    expect(tooLow.status).toBe(400);
    expect((tooLow.body as ApiError).code).toBe('BID_INCREMENT_TOO_LOW');
    const afterTooLow = await getMe(api, u1.accessToken);
    expect(afterTooLow.balance).toBe(startBal1 - 200);

    // Valid increase: delta=10
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 10, mode: 'raise' }).expect(201);
    const after210 = await getMe(api, u1.accessToken);
    // Raise should lock only delta (10), so total locked becomes 210 (not 200+210).
    expect(after210.balance).toBe(startBal1 - 210);

    // Again too small: delta=5 < 10
    const tooLow2 = await api
      .post(`/api/auctions/${auctionId}/bids`)
      .set(authHeader(u1.accessToken))
      .send({ amount: 5, mode: 'raise' });
    expect(tooLow2.status).toBe(400);
    expect((tooLow2.body as ApiError).code).toBe('BID_INCREMENT_TOO_LOW');
    const afterTooLow2 = await getMe(api, u1.accessToken);
    expect(afterTooLow2.balance).toBe(startBal1 - 210);

    // Competitor places higher bid so u1 loses all its bids in final round
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u2.accessToken)).send({ amount: 230, mode: 'new' }).expect(201);
    const afterU2 = await getMe(api, u2.accessToken);
    expect(afterU2.balance).toBe(startBal2 - 230);

    // Manually complete round (avoid reliance on background worker in Jest)
    const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
    expect(rr.status).toBe(200);
    const r = rr.body as unknown as { _id: string; endTime: string; extendedEndTime: string | null };
    const endsAt = new Date(r.extendedEndTime || r.endTime).getTime();
    await new Promise((r2) => setTimeout(r2, Math.max(0, endsAt - Date.now() + 150)));
    await processor.process({ name: 'complete-round', data: { roundId: r._id, auctionId } } as unknown as Job<CompleteRoundJobData>);

    // Ledger must remain consistent for both users.
    for (const userId of [me1._id, me2._id]) {
      const audit = await api.get(`/api/admin/audit/users/${userId}/balance`).set(authHeader(admin.accessToken));
      expect(audit.status).toBe(200);
      const body = audit.body as AuditResult;
      expect(body.issues.length).toBe(0);
    }
  });
});

