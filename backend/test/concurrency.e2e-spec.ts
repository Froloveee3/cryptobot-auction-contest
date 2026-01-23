import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, getMe, http, loginAdmin, poll, registerUser, setupTestApp } from './_helpers';
import { RoundsProcessor } from '../src/rounds/rounds.processor';
import { Job } from 'bullmq';
import { CompleteRoundJobData } from '../src/common/types/queue.types';

jest.setTimeout(180_000);

type RoundDto = {
  _id: string;
  status: 'pending' | 'active' | 'completed';
  endTime: string;
  extendedEndTime: string | null;
};

type ApiError = { code: string; message: string };
type BidDto = { status: 'active' | 'refunded' | 'won' | 'lost' | 'transferred' };
type AuditIssue = { message: string };
type AuditResult = { issues: AuditIssue[] };

describe('Concurrency / race conditions e2e', () => {
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

  it('accepts concurrent bids near endsAt and only returns 201/409/400 (no 500), final invariant holds', async () => {
    const api = http(app);
    const admin = await loginAdmin(api);

    const users = await Promise.all(Array.from({ length: 12 }, async () => registerUser(api)));
    await Promise.all(users.map((u) => depositMe(api, u.accessToken, 50_000)));
    const me = await Promise.all(users.map((u) => getMe(api, u.accessToken)));

    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_CONC_${Date.now()}`,
      description: 'concurrency',
      // Keep auction single-round (so completion refunds/settles everything, no transfers),
      // but increase supply via winnersPerRound so we can accept many concurrent bids.
      totalRounds: 1,
      winnersPerRound: 20,
      roundDuration: 5,
      minBid: 100,
      minIncrement: 1,
      // Keep anti-sniping minimal (1s) to avoid long late windows; we still handle possible extension in completion wait.
      antiSnipingExtension: 1,
    });
    expect(create.status).toBe(201);
    const auctionId = create.body?._id as string;
    await api.post(`/api/auctions/${auctionId}/start`).set(authHeader(admin.accessToken)).send({}).expect(201);

    const r0 = await poll(
      async () => {
        const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
        if (rr.status !== 200) return null;
        const r = rr.body as RoundDto;
        return r.status === 'active' ? r : null;
      },
      { timeoutMs: 10_000, intervalMs: 200 },
    );

    // Wait until we are close to endsAt to force races with completion.
    await poll(
      async () => {
        const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
        if (rr.status !== 200) return null;
        const r = rr.body as RoundDto;
        const endsAt = new Date(r.extendedEndTime || r.endTime).getTime();
        const leftMs = endsAt - Date.now();
        return leftMs > 0 && leftMs <= 1200 ? true : null;
      },
      { timeoutMs: 30_000, intervalMs: 50 },
    );

    const results = await Promise.all(
      users.map((u, idx) =>
        api
          .post(`/api/auctions/${auctionId}/bids`)
          .set(authHeader(u.accessToken))
          .send({ amount: 200 + idx }),
      ),
    );

    // Expect no 500s; only allow success, write conflict, or round ended on boundary.
    for (const resp of results) {
      expect([201, 409, 400]).toContain(resp.status);
      if (resp.status === 409) {
        expect((resp.body as ApiError).code).toBe('WRITE_CONFLICT');
      }
      if (resp.status === 400) {
        // Under dynamic minBid, some boundary requests can be rejected as BID_TOO_LOW as well.
        expect(['ROUND_ENDED', 'BID_TOO_LOW', 'BID_INCREMENT_TOO_LOW']).toContain((resp.body as ApiError).code);
      }
    }

    // Manually complete round (avoid reliance on background worker in Jest).
    // Re-read endsAt because it can be extended by late topN bids (anti-sniping).
    const rr2 = await api.get(`/api/auctions/${auctionId}/current-round`);
    expect(rr2.status).toBe(200);
    const rNow = rr2.body as RoundDto;
    const endsAt = new Date(rNow.extendedEndTime || rNow.endTime).getTime();
    await new Promise((r) => setTimeout(r, Math.max(0, endsAt - Date.now() + 150)));
    await processor.process({ name: 'complete-round', data: { roundId: r0._id, auctionId } } as unknown as Job<CompleteRoundJobData>);

    // Final invariant: no active/transferred bids
    const bidsFinal = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 2000 });
    expect(bidsFinal.status).toBe(200);
    const bids = (bidsFinal.body?.data as BidDto[]) || [];
    const stillActive = bids.filter((b) => b.status === 'active' || b.status === 'transferred');
    expect(stillActive.length).toBe(0);

    // Ledger invariants: no audit issues for all users
    for (const user of me) {
      const audit = await api.get(`/api/admin/audit/users/${user._id}/balance`).set(authHeader(admin.accessToken));
      expect(audit.status).toBe(200);
      const body = audit.body as AuditResult;
      expect(body.issues.length).toBe(0);
    }
  });
});

