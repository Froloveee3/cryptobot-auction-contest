import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, getMe, http, loginAdmin, poll, registerUser, setupTestApp } from './_helpers';
import { RoundsProcessor } from '../src/rounds/rounds.processor';
import { Job } from 'bullmq';
import { CompleteRoundJobData } from '../src/common/types/queue.types';

jest.setTimeout(180_000);

type AuctionDto = {
  _id: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  totalRounds: number;
  winnersPerRound: number;
  roundDuration: number;
  antiSnipingExtension: number;
  totalGiftsDistributed: number;
};

type RoundDto = {
  _id: string;
  roundNumber: number;
  status: 'pending' | 'active' | 'completed';
  startTime: string;
  endTime: string;
  extendedEndTime: string | null;
};

type BidDto = {
  id: string;
  userId: string;
  amount: number;
  status: 'active' | 'refunded' | 'won';
  giftNumber?: number | null;
  wonRoundNumber?: number | null;
};

type AuditIssue = { message: string };
type AuditResult = { issues: AuditIssue[] };

async function waitActiveRound(api: ReturnType<typeof http>, auctionId: string, roundNumber?: number): Promise<RoundDto> {
  return poll(
    async () => {
      const rr = await api.get(`/api/auctions/${auctionId}/current-round`);
      if (rr.status !== 200 || !rr.body) return null;
      const r = rr.body as RoundDto;
      if (r.status !== 'active') return null;
      if (typeof roundNumber === 'number' && r.roundNumber !== roundNumber) return null;
      return r;
    },
    { timeoutMs: 60_000, intervalMs: 200 },
  );
}

async function waitAuctionCompleted(api: ReturnType<typeof http>, auctionId: string): Promise<void> {
  await poll(
    async () => {
      const a = await api.get(`/api/auctions/${auctionId}`);
      if (a.status !== 200) return null;
      return (a.body as AuctionDto)?.status === 'completed' ? true : null;
    },
    { timeoutMs: 120_000, intervalMs: 500 },
  );
}

async function getRoundEndsAtMs(api: ReturnType<typeof http>, auctionId: string, roundId: string): Promise<number> {
  const resp = await api.get(`/api/auctions/${auctionId}/rounds`);
  expect(resp.status).toBe(200);
  const rounds = resp.body as RoundDto[];
  const r = rounds.find((x) => x._id === roundId);
  expect(r).toBeTruthy();
  const endsAt = new Date((r!.extendedEndTime || r!.endTime) as unknown as string).getTime();
  return endsAt;
}

describe('Full auction scenario e2e (many users, many bids, refunds, invariants)', () => {
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

  it('runs 3 rounds with auction-level bids + immediate refunds due to supply cutoff, and ends with no active bids', async () => {
    const api = http(app);

    // Users (need more than remainingSupply=9 to trigger supply-cutoff)
    const users = await Promise.all(Array.from({ length: 12 }, async () => registerUser(api)));
    await Promise.all(users.map((u) => depositMe(api, u.accessToken, 100_000)));
    const me = await Promise.all(users.map((u) => getMe(api, u.accessToken)));
    const tokenByUserId = new Map(me.map((m, idx) => [m._id, users[idx]!.accessToken]));

    // Admin for audit endpoints
    const admin = await loginAdmin(api);

    const create = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_FULL_${Date.now()}`,
      description: 'full scenario',
      totalRounds: 3,
      winnersPerRound: 3, // topN
      // Give enough time so bid placement doesn't accidentally fall into late window (1s) and extend.
      roundDuration: 8,
      minBid: 100,
      minIncrement: 10,
      antiSnipingExtension: 1,
    });
    expect(create.status).toBe(201);
    const auctionId = (create.body as AuctionDto)._id;
    expect(typeof auctionId).toBe('string');

    await api.post(`/api/auctions/${auctionId}/start`).set(authHeader(admin.accessToken)).send({}).expect(201);

    // ---- Round 1 ----
    const r1 = await waitActiveRound(api, auctionId, 1);
    // Place 12+ bids to force immediate refund (rank beyond remaining supply=9).
    // Ensure some "increase" (same user bids again higher; minIncrement enforced against max previous).
    const u0 = users[0]!;
    const u1 = users[1]!;
    const u2 = users[2]!;
    const u3 = users[3]!;
    const u4 = users[4]!;
    const u5 = users[5]!;
    const u6 = users[6]!;
    const u7 = users[7]!;
    const u8 = users[8]!;
    const u9 = users[9]!;
    const u10 = users[10]!;
    const u11 = users[11]!;

    // Initial bids from all 12 users (choose amounts so last 3 are refunded under remainingSupply=9)
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u0.accessToken)).send({ amount: 500, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 490, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u2.accessToken)).send({ amount: 480, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u3.accessToken)).send({ amount: 470, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u4.accessToken)).send({ amount: 460, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u5.accessToken)).send({ amount: 450, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u6.accessToken)).send({ amount: 440, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u7.accessToken)).send({ amount: 430, mode: 'new' }).expect(201);
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u8.accessToken)).send({ amount: 420, mode: 'new' }).expect(201);
    // remainingSupply=9 => after 9 in-play bids, dynamicMinBid becomes (cutoff + minIncrement).
    // To place additional bids we must meet the dynamicMinBid; doing so will DISPLACE the lowest bids,
    // which are then refunded immediately (supply-cutoff invariant).
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u9.accessToken)).send({ amount: 430, mode: 'new' }).expect(201); // displaces 420
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u10.accessToken)).send({ amount: 440, mode: 'new' }).expect(201); // displaces 430
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u11.accessToken)).send({ amount: 450, mode: 'new' }).expect(201); // displaces 440
    // Raise semantics are DELTA.
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u0.accessToken)).send({ amount: 20, mode: 'raise' }).expect(201); // 500 -> 520
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(u1.accessToken)).send({ amount: 20, mode: 'raise' }).expect(201); // 490 -> 510

    // Manually complete round1 (do not rely on background Bull worker in Jest).
    const r1EndsAt = await getRoundEndsAtMs(api, auctionId, r1._id);
    await new Promise((r) => setTimeout(r, Math.max(0, r1EndsAt - Date.now() + 100)));
    await processor.process({ name: 'complete-round', data: { roundId: r1._id, auctionId } } as unknown as Job<CompleteRoundJobData>);

    // Wait until round2 becomes active
    const r2 = await waitActiveRound(api, auctionId, 2);
    expect(r2._id).toBeTruthy();
    expect(r2._id).not.toBe(r1._id);

    // After round1 completes (auction-level model):
    // - winners are marked won
    // - losers remain active
    // - some bids are refunded due to supply-cutoff during bidding
    const bidsAfterR1 = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 500 });
    expect(bidsAfterR1.status).toBe(200);
    const bids1 = (bidsAfterR1.body?.data as BidDto[]) || [];
    expect(bids1.length).toBeGreaterThanOrEqual(12);
    const activeNow = bids1.filter((b) => b.status === 'active');
    const wonNow = bids1.filter((b) => b.status === 'won');
    const refundedNow = bids1.filter((b) => b.status === 'refunded');
    expect(activeNow.length).toBeGreaterThanOrEqual(1);
    expect(wonNow.length).toBeGreaterThanOrEqual(1);
    expect(refundedNow.length).toBeGreaterThanOrEqual(1);
    const refundedUserIdsR1 = Array.from(new Set(refundedNow.map((b) => b.userId)));
    expect(refundedUserIdsR1.length).toBeGreaterThanOrEqual(1);

    // ---- Round 2 ----
    // Use users who were REFUNDED in round 1 => they have no ACTIVE bid, so mode=new is allowed.
    const r2Bidders = refundedUserIdsR1.slice(0, 3);
    expect(r2Bidders.length).toBeGreaterThanOrEqual(1);
    const t0 = tokenByUserId.get(r2Bidders[0]!)!;
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(t0)).send({ amount: 600, mode: 'new' }).expect(201);
    if (r2Bidders[1]) {
      const t1 = tokenByUserId.get(r2Bidders[1])!;
      await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(t1)).send({ amount: 610, mode: 'new' }).expect(201);
    }
    if (r2Bidders[2]) {
      const t2 = tokenByUserId.get(r2Bidders[2])!;
      await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(t2)).send({ amount: 620, mode: 'new' }).expect(201);
    }

    // Manually complete round2
    const r2EndsAt = await getRoundEndsAtMs(api, auctionId, r2._id);
    await new Promise((r) => setTimeout(r, Math.max(0, r2EndsAt - Date.now() + 100)));
    await processor.process({ name: 'complete-round', data: { roundId: r2._id, auctionId } } as unknown as Job<CompleteRoundJobData>);

    // Wait for round3 active
    const r3 = await waitActiveRound(api, auctionId, 3);
    expect(r3._id).toBeTruthy();

    // ---- Round 3 (final) ----
    // Use a fresh set of bidders that are refunded (no active bid), so mode=new is allowed.
    const bidsAfterR2 = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 2000 });
    expect(bidsAfterR2.status).toBe(200);
    const bids2 = (bidsAfterR2.body?.data as BidDto[]) || [];
    const refundedUserIdsR2 = Array.from(new Set(bids2.filter((b) => b.status === 'refunded').map((b) => b.userId)));
    const finalists = (refundedUserIdsR2.length ? refundedUserIdsR2 : refundedUserIdsR1).slice(0, 3);
    const f0 = tokenByUserId.get(finalists[0]!)!;
    await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(f0)).send({ amount: 700, mode: 'new' }).expect(201);
    if (finalists[1]) {
      const f1 = tokenByUserId.get(finalists[1])!;
      await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(f1)).send({ amount: 710, mode: 'new' }).expect(201);
    }
    if (finalists[2]) {
      const f2 = tokenByUserId.get(finalists[2])!;
      await api.post(`/api/auctions/${auctionId}/bids`).set(authHeader(f2)).send({ amount: 720, mode: 'new' }).expect(201);
    }

    // Manually complete final round and ensure auction completes
    const r3EndsAt = await getRoundEndsAtMs(api, auctionId, r3._id);
    await new Promise((r) => setTimeout(r, Math.max(0, r3EndsAt - Date.now() + 100)));
    await processor.process({ name: 'complete-round', data: { roundId: r3._id, auctionId } } as unknown as Job<CompleteRoundJobData>);
    await waitAuctionCompleted(api, auctionId);

    // Final invariant: no ACTIVE bids remain after completion.
    const bidsFinal = await api.get(`/api/auctions/${auctionId}/bids`).query({ page: 1, limit: 2000 });
    expect(bidsFinal.status).toBe(200);
    const bids = (bidsFinal.body?.data as BidDto[]) || [];
    const stillActive = bids.filter((b) => b.status === 'active');
    expect(stillActive.length).toBe(0);
    expect(bids.some((b) => b.status === 'won')).toBe(true);
    expect(bids.some((b) => b.status === 'refunded')).toBe(true);

    // Ledger invariants: admin audit should report no issues for all participants.
    for (const user of me) {
      const audit = await api
        .get(`/api/admin/audit/users/${user._id}/balance`)
        .set(authHeader(admin.accessToken));
      expect(audit.status).toBe(200);
      const body = audit.body as AuditResult;
      expect(Array.isArray(body.issues)).toBe(true);
      expect(body.issues.length).toBe(0);
    }
  });
});

