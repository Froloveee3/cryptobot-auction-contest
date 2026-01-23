

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

async function ensure(cond, msg, extra) {
  if (!cond) {
    const e = new Error(msg);
    if (extra) e.extra = extra;
    throw e;
  }
}

async function main() {
  console.log('SMOKE_BASE_URL:', BASE);

  
  const adminLogin = await post('/auth/login', { username: 'admin', password: 'adminadmin' });
  await ensure(adminLogin.status === 200 || adminLogin.status === 201, 'admin login failed', adminLogin);
  const adminToken = parseJson(adminLogin)?.accessToken;
  await ensure(!!adminToken, 'admin login returned no token', adminLogin);
  const adminAuth = { Authorization: `Bearer ${adminToken}` };

  // Create a bot-backed user (reserved prefix required: "_bot...").
  // Use admin user creation because web registration rejects underscores by design.
  const username = `_botsmoke${Date.now()}${Math.random().toString(16).slice(2)}`.replace(/[^A-Za-z0-9_]/g, '');
  const createUserResp = await post('/users', { username, initialBalance: 260 }, undefined, adminAuth);
  await ensure(createUserResp.status === 201, 'create bot user failed', createUserResp);
  const user = parseJson(createUserResp);
  await ensure(!!user?._id, 'create user returned no _id', createUserResp);

  const auctionResp = await post('/auctions', {
    title: `BOT_SMOKE_${Date.now()}`,
    description: 'bot smoke',
    totalRounds: 1,
    winnersPerRound: 1,
    roundDuration: 12,
    minBid: 100,
    minIncrement: 10,
    antiSnipingWindow: 3,
    antiSnipingExtension: 3,
    maxRoundExtensions: 1,
  });
  await ensure(auctionResp.status === 201, 'create auction failed', auctionResp);
  const auction = parseJson(auctionResp);

  const startResp = await post(`/auctions/${auction._id}/start`);
  await ensure(startResp.status === 201, 'start auction failed', startResp);

  const botCreateResp = await post(
    '/bots',
    {
    name: `SIMPLE_${Date.now()}`,
    type: 'simple',
    userId: user._id,
    auctionId: auction._id,
    minAmount: 100,
    maxAmount: 150,
    // Bot schema enforces >= 1000ms
    minInterval: 1000,
    maxInterval: 2000,
    },
    undefined,
    adminAuth,
  );
  await ensure(botCreateResp.status === 201, 'create bot failed', botCreateResp);
  const bot = parseJson(botCreateResp);
  await ensure(!!bot?._id, 'create bot returned no _id', botCreateResp);

  const botStartResp = await post(`/bots/${bot._id}/start`, undefined, undefined, adminAuth);
  await ensure(botStartResp.status === 201 || botStartResp.status === 200, 'start bot failed', botStartResp);

  console.log('Started bot', bot._id, 'for auction', auction._id);
  await sleep(5000);

  await post(`/bots/${bot._id}/stop`, undefined, undefined, adminAuth).catch(() => undefined);

  const bidsResp = await get(`/auctions/${auction._id}/bids`, { userId: user._id, page: 1, limit: 50 });
  await ensure(bidsResp.status === 200, 'get bids failed', bidsResp);
  const bidsPage = parseJson(bidsResp);
  const bids = bidsPage?.data || [];
  console.log('Bot bids count:', bids.length);
  await ensure(bids.length >= 1, 'expected bot to place at least one bid');

  const balResp = await get(`/users/${user._id}/balance`, undefined, adminAuth);
  await ensure(balResp.status === 200, 'get user balance failed', balResp);
  const balance = parseJson(balResp);
  console.log('User balance after bot activity:', balance);
  await ensure(typeof balance === 'number' && balance >= 0, 'balance should be non-negative');

  console.log('BOT SMOKE PASSED');
}

main().catch((e) => {
  console.error('\nBOT SMOKE FAILED:', e?.message || e);
  if (e?.extra) console.error('extra:', e.extra);
  process.exit(1);
});

