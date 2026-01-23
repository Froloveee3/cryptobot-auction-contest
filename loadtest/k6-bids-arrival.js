import http from 'k6/http';
import { check, sleep } from 'k6';



export const options = {
  scenarios: {
    bids: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 2000), 
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: Number(__ENV.PRE_VUS || 2000),
      maxVUs: Number(__ENV.MAX_VUS || 5000),
    },
  },
};

const BASE = __ENV.K6_BASE_URL || 'http://localhost:3000/api';
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));

function jsonHeaders(extra = {}) {
  return { 'Content-Type': 'application/json', ...extra };
}

function mustEnv(key) {
  const v = __ENV[key];
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

export function setup() {
  const usersCount = Number(__ENV.USERS || 2000);
  const initialBalance = Number(__ENV.INIT_BAL || 100000);
  const firstBid = Number(__ENV.FIRST_BID || 10);
  const minIncrement = Number(__ENV.MIN_INCREMENT || 1);

  const adminUsername = mustEnv('ADMIN_USERNAME');
  const adminPassword = mustEnv('ADMIN_PASSWORD');

  const adminLogin = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ username: adminUsername, password: adminPassword }),
    { headers: jsonHeaders() },
  );
  check(adminLogin, { 'admin login ok': (r) => r.status === 200 });
  const adminToken = adminLogin.json('accessToken');
  if (!adminToken) throw new Error('Failed to get adminToken');

  const auctionResp = http.post(
    `${BASE}/auctions`,
    JSON.stringify({
      title: `K6_AR_${Date.now()}`,
      description: 'k6 constant arrival rate',
      totalRounds: Number(__ENV.TOTAL_ROUNDS || 3),
      winnersPerRound: Number(__ENV.WINNERS_PER_ROUND || 10),
      roundDuration: Number(__ENV.ROUND_DURATION || 30),
      minBid: Number(__ENV.MIN_BID || 10),
      minIncrement,
      antiSnipingWindow: Number(__ENV.ANTI_SNIPING_WINDOW || 1),
      antiSnipingExtension: Number(__ENV.ANTI_SNIPING_EXTENSION || 1),
      maxRoundExtensions: Number(__ENV.MAX_ROUND_EXTENSIONS || 1),
    }),
    { headers: jsonHeaders({ Authorization: `Bearer ${adminToken}` }) },
  );
  check(auctionResp, { 'auction created': (r) => r.status === 201 });
  const auctionId = auctionResp.json('_id');
  if (!auctionId) throw new Error('Failed to create auction');

  const startResp = http.post(`${BASE}/auctions/${auctionId}/start`, null, {
    headers: jsonHeaders({ Authorization: `Bearer ${adminToken}` }),
  });
  check(startResp, { 'auction started': (r) => r.status === 200 });

  const tokens = [];
  for (let i = 0; i < usersCount; i += 1) {
    const username = `k6ar${Date.now()}${i}${Math.random().toString(16).slice(2)}`;
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

    // Seed active bid
    http.post(
      `${BASE}/auctions/${auctionId}/bids`,
      JSON.stringify({ amount: firstBid, mode: 'new' }),
      { headers: jsonHeaders({ Authorization: `Bearer ${token}` }) },
    );

    tokens.push(token);
  }

  return { auctionId, tokens, minIncrement };
}

export default function (data) {
  const tokens = data.tokens || [];
  if (tokens.length === 0) {
    sleep(0.1);
    return;
  }

  const token = tokens[(__ITER + __VU) % tokens.length];
  const delta = Math.max(1, Number(data.minIncrement || 1));

  const resp = http.post(
    `${BASE}/auctions/${data.auctionId}/bids/intake`,
    JSON.stringify({ amount: delta, mode: 'raise' }),
    { headers: jsonHeaders({ Authorization: `Bearer ${token}` }) },
  );

  // Expect 202 (accepted into queue) or load-shedding under pressure.
  check(resp, {
    'status < 500': (r) => r.status > 0 && r.status < 500,
  });

  // Keep no sleeps: arrival rate is controlled by executor.
}

