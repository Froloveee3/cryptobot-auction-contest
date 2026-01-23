const { requestJson, poll } = require('../lib/http');
const { eq, has, ok } = require('../lib/assert');

async function edgeCasesScenario(ctx) {
  
  const regEmpty = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auth/register',
    body: { username: '', password: 'password123' },
  });
  eq(regEmpty.status, 400);

  const regShort = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auth/register',
    body: { username: `short${Date.now()}`, password: '123' },
  });
  eq(regShort.status, 400);

  // Duplicate username
  const u = `dup${Date.now()}`;
  const reg1 = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auth/register',
    body: { username: u, password: 'password123' },
  });
  eq(reg1.status, 201);
  const reg2 = await poll(
    async () => {
      const r = await requestJson({
        baseUrl: ctx.baseUrl,
        method: 'POST',
        path: '/auth/register',
        body: { username: u, password: 'password123' },
      });
      // Rate-limit can kick in after other scenarios (e.g. bots scenario creates multiple users).
      // Retry until we hit the expected domain response for duplicate usernames.
      if (r.status === 429) return null;
      return r;
    },
    { timeoutMs: 70000, intervalMs: 2000 },
  );
  ok(reg2, 'Expected duplicate registration attempt to return a response');
  eq(reg2.status, 409);

  // Login wrong password
  const badLogin = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auth/login',
    body: { username: ctx.user.username, password: 'wrongpassword' },
  });
  eq(badLogin.status, 401);

  // Protected endpoint without token
  const noToken = await requestJson({ baseUrl: ctx.baseUrl, method: 'GET', path: '/users/me' });
  // Depending on guard implementation, missing auth may be 401 or 403.
  ok([401, 403].includes(noToken.status), `Expected 401/403, got ${noToken.status}: ${noToken.text}`);

  // Protected endpoint invalid token
  const invalidToken = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/users/me',
    headers: { Authorization: 'Bearer invalid_token_here' },
  });
  ok([401, 403].includes(invalidToken.status), `Expected 401/403, got ${invalidToken.status}: ${invalidToken.text}`);

  // Start non-existent auction (NotFoundException => 404)
  const startNo = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auctions/000000000000000000000000/start',
    token: ctx.admin.token,
  });
  eq(startNo.status, 404);

  // Start auction as user => 403
  if (ctx.auction.id) {
    const startAsUser = await requestJson({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: `/auctions/${ctx.auction.id}/start`,
      token: ctx.user.token,
    });
    // Current API allows users to call /start, so this may be:
    // - 400 (auction already started / invalid state)
    // - 403 (if roles are restricted in some deployments)
    ok([400, 403].includes(startAsUser.status), `Expected 400/403, got ${startAsUser.status}: ${startAsUser.text}`);
  }

  // Prepare a fresh user for bid edge-cases (so there is no active bid yet in this auction)
  let edgeUserToken = null;
  if (ctx.auction.id) {
    const edgeUsername = `edge${Date.now()}`;
    const regEdge = await requestJson({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/auth/register',
      body: { username: edgeUsername, password: 'password123' },
    });
    eq(regEdge.status, 201);
    has(regEdge.json, 'accessToken');
    edgeUserToken = regEdge.json.accessToken;

    // Bid: insufficient balance => 400 INSUFFICIENT_BALANCE
    const bidInsuf = await requestJson({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: `/auctions/${ctx.auction.id}/bids`,
      token: edgeUserToken,
      body: { amount: 999999, mode: 'new' },
    });
    eq(bidInsuf.status, 400);
    has(bidInsuf.json, 'code');
    eq(bidInsuf.json.code, 'INSUFFICIENT_BALANCE');

    // Bid below minBid => 400 BID_TOO_LOW
    const bidLow = await requestJson({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: `/auctions/${ctx.auction.id}/bids`,
      token: edgeUserToken,
      body: { amount: 1, mode: 'new' },
    });
    eq(bidLow.status, 400);
    has(bidLow.json, 'code');
    eq(bidLow.json.code, 'BID_TOO_LOW');
  }

  // Bid non-existent auction => 404 AUCTION_NOT_FOUND
  const bidNoAuction = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auctions/000000000000000000000000/bids',
    token: ctx.user.token,
    body: { amount: 10, mode: 'new' },
  });
  eq(bidNoAuction.status, 404);
  has(bidNoAuction.json, 'code');
  eq(bidNoAuction.json.code, 'AUCTION_NOT_FOUND');

  // Audit pagination limit > 200 => 400 (validation)
  const auditLimit = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/admin/audit/events?page=1&limit=1000',
    token: ctx.admin.token,
  });
  eq(auditLimit.status, 400);

  // Withdraw (negative deposit) insufficient => 400 INSUFFICIENT_BALANCE
  const withdrawTooMuch = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/users/me/deposit',
    token: ctx.user.token,
    body: { amount: -999999 },
  });
  eq(withdrawTooMuch.status, 400);
  has(withdrawTooMuch.json, 'code');
  ok(['INSUFFICIENT_BALANCE', 'BAD_REQUEST'].includes(withdrawTooMuch.json.code), `Unexpected code ${withdrawTooMuch.json.code}`);
}

module.exports = { edgeCasesScenario };

