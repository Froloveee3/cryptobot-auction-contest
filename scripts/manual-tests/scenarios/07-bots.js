const { requestJson, poll } = require('../lib/http');
const { eq, ok, has, isString, isNumber } = require('../lib/assert');

function safeStr(v) {
  return v === undefined || v === null ? '' : String(v);
}

async function createAuction(ctx, { titlePrefix, botsEnabled }) {
  const create = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auctions',
    token: ctx.user.token,
    headers: { 'x-request-id': `auction-bots-create-${Date.now()}` },
    body: {
      title: `${titlePrefix}_${Date.now()}`,
      description: 'Manual scripted bots scenario',
      totalRounds: 1,
      winnersPerRound: 2,
      // Keep short but give enough time for delayed bot jobs.
      roundDuration: 25,
      minBid: 10,
      minIncrement: 2,
      antiSnipingWindow: 5,
      antiSnipingExtension: 5,
      maxRoundExtensions: 1,
      botsEnabled: Boolean(botsEnabled),
    },
  });
  eq(create.status, 201, create.text);
  has(create.json, '_id');
  isString(create.json._id);
  return create.json;
}

async function startAuctionAsAdmin(ctx, auctionId) {
  const start = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: `/auctions/${auctionId}/start`,
    token: ctx.admin.token,
    headers: { 'x-request-id': `auction-bots-start-${Date.now()}` },
  });
  eq(start.status, 200, start.text);
  eq(start.json.status, 'active');
  return start.json;
}

async function getBotsForAuction(ctx, auctionId) {
  const r = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: `/bots?auctionId=${encodeURIComponent(auctionId)}`,
    token: ctx.admin.token,
  });
  eq(r.status, 200, r.text);
  ok(Array.isArray(r.json), 'Expected bots array');
  return r.json.filter((b) => safeStr(b && b.auctionId) === safeStr(auctionId));
}

async function getBidsForUser(ctx, auctionId, userId) {
  const r = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: `/auctions/${auctionId}/bids?userId=${encodeURIComponent(userId)}&page=1&limit=100`,
  });
  eq(r.status, 200, r.text);
  ok(r.json && Array.isArray(r.json.data), 'Expected bids page with data[]');
  return r.json.data;
}

async function placeBidBestEffort(ctx, { auctionId, token, amount, mode }) {
  const r = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: `/auctions/${auctionId}/bids`,
    token,
    headers: { 'x-request-id': `bid-bots-${mode}-${Date.now()}` },
    body: { amount, mode },
  });
  return r;
}

async function botsScenario(ctx) {
  ok(ctx.admin && ctx.admin.token, 'admin token missing (run auth scenario first)');
  ok(ctx.user && ctx.user.token, 'user token missing (run auth scenario first)');

  // --- Scenario A: bots enabled -> we should observe bot entities + at least one bot bid
  const auction = await createAuction(ctx, { titlePrefix: 'BOTS_ON', botsEnabled: true });
  const auctionId = auction._id;
  await startAuctionAsAdmin(ctx, auctionId);

  // Wait for auto-created bots (round-start handler enqueues jobs, processor creates bots lazily on first job run)
  const bots = await poll(
    async () => {
      const list = await getBotsForAuction(ctx, auctionId);
      return list.length >= 2 ? list : null;
    },
    { timeoutMs: 25000, intervalMs: 750 },
  );
  ok(Array.isArray(bots) && bots.length >= 2, `Expected >=2 bots for auction ${auctionId}`);

  const botUserIds = Array.from(new Set(bots.map((b) => safeStr(b.userId)).filter(Boolean)));
  ok(botUserIds.length >= 1, 'Expected bots to have userId');

  // Wait until bots place at least one bid (across all bot users)
  const botBidStats = await poll(
    async () => {
      let total = 0;
      const perBot = {};
      for (const uid of botUserIds) {
        // eslint-disable-next-line no-await-in-loop
        const bids = await getBidsForUser(ctx, auctionId, uid);
        perBot[uid] = bids.length;
        total += bids.length;
      }
      return total >= 1 ? { total, perBot } : null;
    },
    { timeoutMs: 35000, intervalMs: 1000 },
  );
  ok(botBidStats && botBidStats.total >= 1, 'Expected at least one bot bid');

  // Sanity: bot bids should respect minBid (domain rules enforce this; we verify output)
  for (const uid of botUserIds) {
    // eslint-disable-next-line no-await-in-loop
    const bids = await getBidsForUser(ctx, auctionId, uid);
    for (const b of bids) {
      has(b, 'amount');
      isNumber(b.amount);
      ok(b.amount >= (auction.minBid || 1), `Bot bid too low: ${b.amount} < ${auction.minBid}`);
    }
  }

  // Competition: a new human user should be able to enter and (if needed) adjust to dynamic minBid
  const competitorUsername = `comp${Date.now()}`;
  const reg = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auth/register',
    headers: { 'x-request-id': `bots-comp-reg-${Date.now()}` },
    body: { username: competitorUsername, password: 'password123' },
  });
  eq(reg.status, 201, reg.text);
  has(reg.json, 'accessToken');
  isString(reg.json.accessToken);
  const competitorToken = reg.json.accessToken;

  const dep = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/users/me/deposit',
    token: competitorToken,
    body: { amount: 5000 },
  });
  eq(dep.status, 200, dep.text);

  // Try to place at auction.minBid; if too low, retry with server-provided minimum.
  let place = await placeBidBestEffort(ctx, { auctionId, token: competitorToken, amount: auction.minBid || 1, mode: 'new' });
  if (
    place.status === 400 &&
    place.json &&
    place.json.code === 'BID_TOO_LOW' &&
    place.json.details &&
    typeof place.json.details.minBid === 'number' &&
    Number.isFinite(place.json.details.minBid)
  ) {
    const required = place.json.details.minBid;
    place = await placeBidBestEffort(ctx, { auctionId, token: competitorToken, amount: required, mode: 'new' });
  }
  ok([201, 400].includes(place.status), `Unexpected status placing competitor bid: ${place.status} ${place.text}`);
  if (place.status === 400) {
    // Round might have ended; that's acceptable for this short-duration scenario.
    ok(place.json && place.json.code === 'ROUND_ENDED', `Expected ROUND_ENDED, got: ${place.text}`);
  }

  // Try a raise; should either succeed or fail with a known domain error in short rounds.
  const raise = await placeBidBestEffort(ctx, { auctionId, token: competitorToken, amount: auction.minIncrement || 1, mode: 'raise' });
  ok([201, 400].includes(raise.status), `Unexpected status raising competitor bid: ${raise.status} ${raise.text}`);
  if (raise.status === 400) {
    ok(
      raise.json && ['ROUND_ENDED', 'NO_ACTIVE_BID_TO_RAISE', 'BID_INCREMENT_TOO_LOW'].includes(raise.json.code),
      `Unexpected raise error: ${raise.text}`,
    );
  }

  // Contention smoke: several users bid concurrently; ensure no 500s and only expected domain errors.
  const contenders = Array.from({ length: 3 }).map((_, i) => `cont${Date.now()}${i}`);
  const contenderTokens = [];
  for (const username of contenders) {
    // eslint-disable-next-line no-await-in-loop
    const r = await requestJson({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/auth/register',
      body: { username, password: 'password123' },
    });
    eq(r.status, 201, r.text);
    has(r.json, 'accessToken');
    isString(r.json.accessToken);
    contenderTokens.push(r.json.accessToken);
  }
  const depositResults = await Promise.all(
    contenderTokens.map((t) =>
      requestJson({ baseUrl: ctx.baseUrl, method: 'POST', path: '/users/me/deposit', token: t, body: { amount: 2000 } }),
    ),
  );
  for (const d of depositResults) {
    eq(d.status, 200, d.text);
  }

  const expectedCodes = new Set([
    'BID_TOO_LOW',
    'BID_INCREMENT_TOO_LOW',
    'ROUND_ENDED',
    'NO_ACTIVE_BID_TO_RAISE',
    'NEW_BID_NOT_ALLOWED_WHEN_ACTIVE_EXISTS',
    'INSUFFICIENT_BALANCE',
    'WRITE_CONFLICT',
    'AUCTION_BUSY',
    'NO_ACTIVE_ROUND',
  ]);

  const results = await Promise.all(
    contenderTokens.map(async (t) => {
      // Try new-bid; if too low, retry with minBid from error details.
      const first = await placeBidBestEffort(ctx, { auctionId, token: t, amount: auction.minBid || 1, mode: 'new' });
      if (first.status === 201) return first;
      if (
        first.status === 400 &&
        first.json &&
        first.json.code === 'BID_TOO_LOW' &&
        first.json.details &&
        typeof first.json.details.minBid === 'number' &&
        Number.isFinite(first.json.details.minBid)
      ) {
        return await placeBidBestEffort(ctx, { auctionId, token: t, amount: first.json.details.minBid, mode: 'new' });
      }
      return first;
    }),
  );

  for (const r of results) {
    ok([201, 400, 409, 429].includes(r.status), `Unexpected contender response: ${r.status} ${r.text}`);
    // Never accept generic 500 here — that's exactly what this test tries to catch.
    ok(r.status !== 500, `Got 500 from bids endpoint: ${r.text}`);
    if (r.status !== 201) {
      ok(r.json && expectedCodes.has(r.json.code), `Unexpected error code: ${r.text}`);
    }
  }

  // Guardrail: bots should not spam bids (this test runs on empty local stack; keep it forgiving).
  // The scheduler aims for <=3 actions per round; allow some slack.
  ok(botBidStats.total <= 20, `Too many bot bids observed (${botBidStats.total}) - possible spam/regression`);

  // --- Scenario B: bots disabled -> no auto-created bots for this auction
  const auctionOff = await createAuction(ctx, { titlePrefix: 'BOTS_OFF', botsEnabled: false });
  const auctionOffId = auctionOff._id;
  await startAuctionAsAdmin(ctx, auctionOffId);

  // Wait a bit: if bots are incorrectly running when disabled, we might see bot docs appear.
  const botsOff = await poll(
    async () => {
      const list = await getBotsForAuction(ctx, auctionOffId);
      return list.length > 0 ? list : null;
    },
    { timeoutMs: 6000, intervalMs: 750 },
  ).catch(() => null);
  ok(!botsOff, 'Expected no bots for botsEnabled=false auction (found some bot docs)');
}

module.exports = { botsScenario };

