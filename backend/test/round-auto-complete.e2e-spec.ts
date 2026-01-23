import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { authHeader, depositMe, http, loginAdmin, poll, registerUser, setupTestApp } from './_helpers';

jest.setTimeout(180_000); 

type RoundDto = {
  _id: string;
  status: 'pending' | 'active' | 'completed';
  roundNumber: number;
  endTime: string;
  extendedEndTime: string | null;
};

type AuctionDto = {
  _id: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  totalRounds: number;
  currentRound?: number;
};


describe('Round auto-completion via outbox (regression)', () => {
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

  it('completes all rounds automatically without manual processor invocation', async () => {
    const api = http(app);

    
    const u1 = await registerUser(api);
    const u2 = await registerUser(api);
    await depositMe(api, u1.accessToken, 100_000);
    await depositMe(api, u2.accessToken, 100_000);

    const admin = await loginAdmin(api);

    
    const createResp = await api.post('/api/auctions').set(authHeader(admin.accessToken)).send({
      title: `E2E_AUTO_COMPLETE_${Date.now()}`,
      description: 'Regression test for auto-completion',
      totalRounds: 2,
      winnersPerRound: 1,
      roundDuration: 10, // 10 seconds per round
      minBid: 100,
      minIncrement: 10,
      antiSnipingWindow: 3,
      antiSnipingExtension: 3,
      maxRoundExtensions: 1,
    });
    expect(createResp.status).toBe(201);
    const auctionId = createResp.body?._id as string;
    expect(auctionId).toBeTruthy();
    console.log(`Created auction: ${auctionId}`);

    // Start auction
    const startResp = await api
      .post(`/api/auctions/${auctionId}/start`)
      .set(authHeader(admin.accessToken))
      .send({});
    expect(startResp.status).toBe(201);
    console.log('Auction started');

    // Place bids in round 1
    const bid1Resp = await api
      .post(`/api/auctions/${auctionId}/bids`)
      .set(authHeader(u1.accessToken))
      .send({ amount: 200 });
    expect(bid1Resp.status).toBe(201);
    console.log('User 1 placed bid: 200');

    const bid2Resp = await api
      .post(`/api/auctions/${auctionId}/bids`)
      .set(authHeader(u2.accessToken))
      .send({ amount: 300 });
    expect(bid2Resp.status).toBe(201);
    console.log('User 2 placed bid: 300');

    // Get round 1 info
    const r1Resp = await api.get(`/api/auctions/${auctionId}/current-round`);
    expect(r1Resp.status).toBe(200);
    const round1 = r1Resp.body as RoundDto;
    expect(round1.roundNumber).toBe(1);
    expect(round1.status).toBe('active');
    console.log(`Round 1 ID: ${round1._id}, ends at: ${round1.endTime}`);

    // Wait for round 1 to complete AUTOMATICALLY
    console.log('Waiting for round 1 to complete automatically...');
    await poll(
      async () => {
        const resp = await api.get(`/api/auctions/${auctionId}/rounds`);
        if (resp.status !== 200) return null;
        const rounds = resp.body as RoundDto[];
        const r1 = rounds.find((r) => r.roundNumber === 1);
        if (r1?.status === 'completed') {
          console.log('Round 1 completed!');
          return true;
        }
        return null;
      },
      { timeoutMs: 30_000, intervalMs: 500 },
    );

    // Verify round 2 exists and is active
    console.log('Checking for round 2...');
    const round2 = await poll(
      async () => {
        const resp = await api.get(`/api/auctions/${auctionId}/rounds`);
        if (resp.status !== 200) return null;
        const rounds = resp.body as RoundDto[];
        const r2 = rounds.find((r) => r.roundNumber === 2);
        if (r2) {
          console.log(`Round 2 found: ${r2._id}, status: ${r2.status}`);
          return r2;
        }
        return null;
      },
      { timeoutMs: 10_000, intervalMs: 500 },
    );
    expect(round2).toBeTruthy();
    expect(round2.roundNumber).toBe(2);

    // Wait for round 2 to complete AUTOMATICALLY (critical regression test!)
    console.log('Waiting for round 2 to complete automatically (regression test)...');
    await poll(
      async () => {
        const resp = await api.get(`/api/auctions/${auctionId}/rounds`);
        if (resp.status !== 200) return null;
        const rounds = resp.body as RoundDto[];
        const r2 = rounds.find((r) => r.roundNumber === 2);
        if (r2?.status === 'completed') {
          console.log('Round 2 completed! BUG IS FIXED!');
          return true;
        }
        return null;
      },
      { timeoutMs: 30_000, intervalMs: 500 },
    );

    // Verify auction is completed
    console.log('Verifying auction completed...');
    await poll(
      async () => {
        const resp = await api.get(`/api/auctions/${auctionId}`);
        if (resp.status !== 200) return null;
        const auction = resp.body as AuctionDto;
        if (auction.status === 'completed') {
          console.log('Auction completed successfully!');
          return true;
        }
        return null;
      },
      { timeoutMs: 10_000, intervalMs: 500 },
    );

    // Final verification: all rounds completed
    const finalRoundsResp = await api.get(`/api/auctions/${auctionId}/rounds`);
    expect(finalRoundsResp.status).toBe(200);
    const finalRounds = finalRoundsResp.body as RoundDto[];
    expect(finalRounds.length).toBe(2);
    expect(finalRounds.every((r) => r.status === 'completed')).toBe(true);
    console.log('All rounds completed. Test passed!');
  });
});
