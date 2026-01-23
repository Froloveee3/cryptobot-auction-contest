

const http = require('http');

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000/api';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function req(method, path, body, qs, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    if (qs && typeof qs === 'object') {
      for (const [k, v] of Object.entries(qs)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': data.length } : {}),
          ...(headers || {}),
        },
      },
      (resp) => {
        let b = '';
        resp.on('data', (d) => (b += d));
        resp.on('end', () => resolve({ status: resp.statusCode, body: b }));
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function post(path, body, qs, headers) {
  return req('POST', path, body, qs, headers);
}
async function get(path, qs, headers) {
  return req('GET', path, undefined, qs, headers);
}

function parseJson(resp) {
  try {
    return JSON.parse(resp.body);
  } catch {
    return null;
  }
}

async function poll(fn, { timeoutMs = 30000, intervalMs = 500 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fn();
    if (res) return res;
    if (Date.now() - start > timeoutMs) return null;
    await sleep(intervalMs);
  }
}

async function ensure(status, msg, extra) {
  if (!status) {
    const e = new Error(msg);
    if (extra) e.extra = extra;
    throw e;
  }
}

async function registerUser(prefix, password = 'password123') {
  const username = `${prefix}${Date.now()}${Math.random().toString(16).slice(2)}`;
  const resp = await post('/auth/register', { username, password });
  await ensure(resp.status === 201, 'auth register failed', resp);
  const data = parseJson(resp);
  await ensure(!!data?.accessToken, 'auth register returned no accessToken', resp);
  return { username, accessToken: data.accessToken };
}

async function depositMe(accessToken, amount) {
  const resp = await post('/users/me/deposit', { amount }, undefined, { Authorization: `Bearer ${accessToken}` });
  await ensure(resp.status === 201 || resp.status === 200, 'depositMe failed', resp);
  return parseJson(resp);
}

async function createAuction(dto) {
  const resp = await post('/auctions', dto);
  await ensure(resp.status === 201, 'create auction failed', resp);
  return parseJson(resp);
}

async function startAuction(auctionId) {
  const resp = await post(`/auctions/${auctionId}/start`);
  await ensure(resp.status === 201, 'start auction failed', resp);
  return parseJson(resp);
}

async function getAuction(auctionId) {
  const resp = await get(`/auctions/${auctionId}`);
  await ensure(resp.status === 200, 'get auction failed', resp);
  return parseJson(resp);
}

async function getCurrentRound(auctionId) {
  const resp = await get(`/auctions/${auctionId}/current-round`);
  await ensure(resp.status === 200, 'get current round failed', resp);
  return parseJson(resp);
}

async function placeBid(auctionId, accessToken, amount) {
  const resp = await post(`/auctions/${auctionId}/bids`, { amount }, undefined, { Authorization: `Bearer ${accessToken}` });
  await ensure(resp.status === 201, 'place bid failed', resp);
  return parseJson(resp);
}

async function getAllBids(auctionId, page = 1, limit = 200) {
  const resp = await get(`/auctions/${auctionId}/bids`, { page, limit });
  await ensure(resp.status === 200, 'get bids failed', resp);
  return parseJson(resp);
}

async function scenarioTransferAndFinalRefund() {
  console.log('\n=== Scenario: transfer -> final refund (2 rounds, 1 winner each) ===');
  const u1 = await registerUser('smoke_u1');
  const u2 = await registerUser('smoke_u2');
  const u3 = await registerUser('smoke_u3');
  await depositMe(u1.accessToken, 50000);
  await depositMe(u2.accessToken, 50000);
  await depositMe(u3.accessToken, 50000);

  const auction = await createAuction({
    title: `SMOKE_${Date.now()}`,
    description: 'smoke e2e',
    totalRounds: 2,
    winnersPerRound: 1,
    roundDuration: 5,
    minBid: 100,
    minIncrement: 10,
    antiSnipingWindow: 2,
    antiSnipingExtension: 2,
    maxRoundExtensions: 1,
  });

  await startAuction(auction._id);

  // Place bids in round 1 (3 bids -> 1 winner, 2 transferred)
  await placeBid(auction._id, u1.accessToken, 200);
  await placeBid(auction._id, u2.accessToken, 300);
  await placeBid(auction._id, u3.accessToken, 250);

  // Wait until auction completes (BullMQ processes both rounds)
  const completedAuction = await poll(
    async () => {
      const a = await getAuction(auction._id);
      return a?.status === 'completed' ? a : null;
    },
    { timeoutMs: 45000, intervalMs: 1000 },
  );
  await ensure(!!completedAuction, 'auction did not complete in time');

  const bidsPage = await getAllBids(auction._id, 1, 200);
  const bids = bidsPage?.data || [];
  const statuses = bids.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  console.log('auction.status:', completedAuction.status);
  console.log('auction.totalGiftsDistributed:', completedAuction.totalGiftsDistributed);
  console.log('bids statuses:', statuses);

  // Invariants
  const stillActive = bids.filter((b) => b.status === 'active' || b.status === 'transferred');
  await ensure(stillActive.length === 0, 'invariant failed: active/transferred bids exist after completion', {
    stillActive,
  });

  const refunded = bids.filter((b) => b.status === 'refunded');
  await ensure(refunded.length >= 1, 'expected at least one refunded bid (loser after final round)');

  // Supply is implicit in our model: totalRounds * winnersPerRound
  const totalSupply = completedAuction.totalRounds * completedAuction.winnersPerRound;
  await ensure(
    completedAuction.totalGiftsDistributed >= 0 && completedAuction.totalGiftsDistributed <= totalSupply,
    'invariant failed: totalGiftsDistributed out of range',
    { totalSupply, totalGiftsDistributed: completedAuction.totalGiftsDistributed },
  );

  console.log('OK: transfer/final refund invariants hold');
}

async function scenarioZeroBidsHardStop() {
  console.log('\n=== Scenario: Assumption A TC-A1 (0 bids, hard stop) ===');
  const auction = await createAuction({
    title: `SMOKE_ZERO_${Date.now()}`,
    description: 'zero bids',
    totalRounds: 2,
    winnersPerRound: 1,
    roundDuration: 4,
    minBid: 100,
    minIncrement: 10,
    antiSnipingWindow: 2,
    antiSnipingExtension: 2,
    maxRoundExtensions: 1,
  });

  await startAuction(auction._id);

  const completedAuction = await poll(
    async () => {
      const a = await getAuction(auction._id);
      return a?.status === 'completed' ? a : null;
    },
    { timeoutMs: 45000, intervalMs: 1000 },
  );
  await ensure(!!completedAuction, 'zero-bids auction did not complete in time');
  await ensure(completedAuction.totalGiftsDistributed === 0, 'expected totalGiftsDistributed=0 for zero-bids');

  console.log('OK: auction completed after totalRounds with 0 distributed gifts');
}

async function scenarioSupplyCutoffImmediateRefund() {
  console.log('\n=== Scenario: supply-cutoff immediate refund (rank > remainingSupply) ===');
  const users = [];
  for (let i = 0; i < 5; i += 1) {
    // enough balance for one bid
    // eslint-disable-next-line no-await-in-loop
    const u = await registerUser(`smoke_cutoff_u${i + 1}`);
    // eslint-disable-next-line no-await-in-loop
    await depositMe(u.accessToken, 20000);
    users.push(u);
  }

  // totalSupply = totalRounds * winnersPerRound = 3
  // Place 5 bids => ranks 4-5 can never win => should be refunded immediately after round 1 completes.
  const auction = await createAuction({
    title: `SMOKE_CUTOFF_${Date.now()}`,
    description: 'supply cutoff',
    totalRounds: 3,
    winnersPerRound: 1,
    roundDuration: 4,
    minBid: 100,
    minIncrement: 10,
    antiSnipingWindow: 2,
    antiSnipingExtension: 2,
    maxRoundExtensions: 1,
  });

  await startAuction(auction._id);

  // amounts ensure deterministic ranking
  const amounts = [500, 400, 300, 200, 150];
  for (let i = 0; i < users.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await placeBid(auction._id, users[i].accessToken, amounts[i]);
  }

  // Wait until round 1 is completed (auction should still be active, moving to round 2)
  const round1Done = await poll(
    async () => {
      const resp = await get(`/auctions/${auction._id}/rounds`);
      if (resp.status !== 200) return null;
      const rounds = parseJson(resp);
      const r1 = Array.isArray(rounds) ? rounds.find((r) => r.roundNumber === 1) : null;
      if (r1 && r1.status === 'completed') return r1;
      return null;
    },
    { timeoutMs: 30000, intervalMs: 500 },
  );
  await ensure(!!round1Done, 'round 1 did not complete in time');

  const aMid = await getAuction(auction._id);
  await ensure(aMid.status === 'active', 'expected auction to still be active after round 1');

  const bidsPage = await getAllBids(auction._id, 1, 200);
  const bids = bidsPage?.data || [];
  const refundedNow = bids.filter((b) => b.status === 'refunded');

  console.log('after round1: refunded=', refundedNow.length, 'statuses=', bids.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {}));

  await ensure(refundedNow.length >= 2, 'expected at least 2 bids refunded immediately due to supply cutoff');
  console.log('OK: supply-cutoff bids refunded immediately after round 1');
}

async function scenarioAntiSnipingTelegramLikeTopN() {
  console.log('\n=== Scenario: anti-sniping Telegram-like (late bid in topN extends to cap) ===');
  const u1 = await registerUser('smoke_as_u1');
  const u2 = await registerUser('smoke_as_u2');
  await depositMe(u1.accessToken, 50000);
  await depositMe(u2.accessToken, 50000);

  // For Telegram-like spec:
  // - lateWindowSeconds = increase
  // - cap: start + duration + increase (single extension)
  const duration = 6;
  const increase = 4;
  const auction = await createAuction({
    title: `SMOKE_AS_${Date.now()}`,
    description: 'anti-sniping spec',
    totalRounds: 1,
    winnersPerRound: 1, // topN = 1
    roundDuration: duration,
    minBid: 100,
    minIncrement: 10,
    antiSnipingExtension: increase,
    // window/max extensions are ignored/normalized by backend (Telegram-like spec)
    antiSnipingWindow: 1,
    maxRoundExtensions: 9,
  });

  await startAuction(auction._id);
  const r0 = await getCurrentRound(auction._id);
  await ensure(!!r0?.startTime, 'round.startTime missing');
  const startedAt = new Date(r0.startTime).getTime();
  const baseEndsAt = startedAt + duration * 1000;
  const capEndsAt = startedAt + (duration + increase) * 1000;

  // Initial leader (u1)
  await placeBid(auction._id, u1.accessToken, 200);
  // Initial non-top bid (u2)
  await placeBid(auction._id, u2.accessToken, 150);

  // Wait until we're in late window (<= increase seconds to end).
  await poll(
    async () => {
      const r = await getCurrentRound(auction._id);
      const endsAt = new Date(r.extendedEndTime || r.endTime).getTime();
      const left = (endsAt - Date.now()) / 1000;
      return left <= increase - 1 && left > 0 ? true : null;
    },
    { timeoutMs: 15000, intervalMs: 250 },
  );

  // Late bid but NOT in top1 => must NOT extend.
  await placeBid(auction._id, u2.accessToken, 160); // increment >= 10, still below 200
  const r1 = await getCurrentRound(auction._id);
  const ends1 = new Date(r1.extendedEndTime || r1.endTime).getTime();
  await ensure(
    ends1 <= capEndsAt && ends1 >= baseEndsAt,
    'endsAt out of expected range after non-top late bid',
    { ends1, baseEndsAt, capEndsAt },
  );
  await ensure(
    !r1.extendedEndTime || new Date(r1.extendedEndTime).getTime() !== capEndsAt,
    'round should NOT extend to cap for late bid outside topN',
    { extendedEndTime: r1.extendedEndTime, capEndsAt },
  );

  // Late bid IN top1 => must extend to cap.
  await placeBid(auction._id, u1.accessToken, 220);
  const r2 = await getCurrentRound(auction._id);
  const ends2 = new Date(r2.extendedEndTime || r2.endTime).getTime();
  await ensure(ends2 === capEndsAt, 'round should extend exactly to capEndsAt', { ends2, capEndsAt });
  console.log('OK: anti-sniping cap extension works (duration + increase, topN trigger)');
}

async function main() {
  console.log('SMOKE_BASE_URL:', BASE);
  await scenarioTransferAndFinalRefund();
  await scenarioZeroBidsHardStop();
  await scenarioSupplyCutoffImmediateRefund();
  await scenarioAntiSnipingTelegramLikeTopN();
  console.log('\nALL SMOKE CHECKS PASSED');
}

main().catch((e) => {
  console.error('\nSMOKE FAILED:', e?.message || e);
  if (e?.extra) console.error('extra:', e.extra);
  process.exit(1);
});

