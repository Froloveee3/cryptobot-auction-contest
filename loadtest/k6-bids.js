import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

export const options = {
  vus: Number(__ENV.VUS || 200),
  duration: __ENV.DURATION || '30s',
};

const BASE = __ENV.K6_BASE_URL || 'http://backend:3000/api';

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));

const serverErrors = new Counter('server_errors_total');
const unexpectedStatuses = new Counter('unexpected_status_total');
const netErrors = new Counter('net_errors_total');

function jsonHeaders(extra = {}) {
  return { 'Content-Type': 'application/json', ...extra };
}

function mustEnv(key) {
  const v = __ENV[key];
  if (!v) {
    throw new Error(`Missing env ${key}`);
  }
  return v;
}

export function setup() {
  const usersCount = Number(__ENV.USERS || 200);
  const initialBalance = Number(__ENV.INIT_BAL || 50000);

  const adminUsername = mustEnv('ADMIN_USERNAME');
  const adminPassword = mustEnv('ADMIN_PASSWORD');

  // Login admin (auction start requires admin)
  const adminLogin = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ username: adminUsername, password: adminPassword }),
    { headers: jsonHeaders() },
  );
  check(adminLogin, { 'admin login ok': (r) => r.status === 200 });
  const adminToken = adminLogin.json('accessToken');
  if (!adminToken) throw new Error('Failed to get adminToken');

  // Create auction
  // NOTE: create requires auth in this project; we create it as admin for simplicity.
  const auctionResp = http.post(
    `${BASE}/auctions`,
    JSON.stringify({
      title: `K6_${Date.now()}`,
      description: 'k6 load test',
      totalRounds: Number(__ENV.TOTAL_ROUNDS || 3),
      winnersPerRound: Number(__ENV.WINNERS_PER_ROUND || 10),
      roundDuration: Number(__ENV.ROUND_DURATION || 30),
      minBid: Number(__ENV.MIN_BID || 10),
      minIncrement: Number(__ENV.MIN_INCREMENT || 1),
      antiSnipingWindow: Number(__ENV.ANTI_SNIPING_WINDOW || 1),
      antiSnipingExtension: Number(__ENV.ANTI_SNIPING_EXTENSION || 1),
      maxRoundExtensions: Number(__ENV.MAX_ROUND_EXTENSIONS || 1),
    }),
    { headers: jsonHeaders({ Authorization: `Bearer ${adminToken}` }) },
  );
  check(auctionResp, { 'auction created': (r) => r.status === 201 });
  const auction = auctionResp.json();

  // Start auction
  const startResp = http.post(`${BASE}/auctions/${auction._id}/start`, null, {
    headers: jsonHeaders({ Authorization: `Bearer ${adminToken}` }),
  });
  check(startResp, { 'auction started': (r) => r.status === 200 });

  // Register users + deposit
  const tokens = [];
  for (let i = 0; i < usersCount; i += 1) {
    const username = `k6u${Date.now()}${i}${Math.random().toString(16).slice(2)}`;
    const regResp = http.post(
      `${BASE}/auth/register`,
      JSON.stringify({ username, password: 'password123' }),
      { headers: jsonHeaders() },
    );
    if (regResp.status !== 201) continue;
    const token = regResp.json('accessToken');
    if (!token) continue;

    const depResp = http.post(
      `${BASE}/users/me/deposit`,
      JSON.stringify({ amount: initialBalance }),
      { headers: jsonHeaders({ Authorization: `Bearer ${token}` }) },
    );
    if (depResp.status !== 200 && depResp.status !== 201) continue;

    // Place initial bid (mode=new) once per user, so hot loop can use mode=raise (delta)
    const firstBid = http.post(
      `${BASE}/auctions/${auction._id}/bids`,
      JSON.stringify({ amount: Number(__ENV.FIRST_BID || 10), mode: 'new' }),
      { headers: jsonHeaders({ Authorization: `Bearer ${token}` }) },
    );
    if (firstBid.status !== 201 && firstBid.status !== 400 && firstBid.status !== 409 && firstBid.status !== 429) continue;

    tokens.push(token);
  }

  return { auctionId: auction._id, tokens, minIncrement: Number(__ENV.MIN_INCREMENT || 1) };
}

export default function (data) {
  const tokens = data.tokens || [];
  if (tokens.length === 0) {
    sleep(1);
    return;
  }

  const token = tokens[(__VU - 1) % tokens.length];
  // Hot loop: raise by delta >= minIncrement.
  const delta = Math.max(1, Number(data.minIncrement || 1));

  const resp = http.post(
    `${BASE}/auctions/${data.auctionId}/bids`,
    JSON.stringify({ amount: delta, mode: 'raise' }),
    { headers: jsonHeaders({ Authorization: `Bearer ${token}` }) },
  );

  const st = resp.status;
  if (st === 0) {
    netErrors.add(1);
    // eslint-disable-next-line no-console
    console.error(`net_error vu=${__VU} iter=${__ITER} code=${resp.error_code} err=${resp.error}`);
  }

  if (st >= 500 || st === 0) serverErrors.add(1);
  // Expected under load: 201/400/409/429
  if (st !== 201 && st !== 429 && st !== 400 && st !== 409) unexpectedStatuses.add(1, { status: String(st) });

  check(resp, { 'status < 500': (r) => r.status > 0 && r.status < 500 });

  sleep(Number(__ENV.SLEEP_SEC || 0.05));
}

