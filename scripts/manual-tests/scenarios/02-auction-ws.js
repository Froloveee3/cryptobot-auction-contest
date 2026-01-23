const { io } = require('socket.io-client');
const { requestJson, poll } = require('../lib/http');
const { eq, has, isString, isObject, ok } = require('../lib/assert');

function waitForEvent(socket, eventName, { timeoutMs = 5000, predicate } = {}) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error(`WS timeout waiting for "${eventName}" after ${timeoutMs}ms`));
    }, timeoutMs);

    const handler = (payload) => {
      try {
        if (predicate && !predicate(payload)) return;
        cleanup();
        resolve(payload);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    function cleanup() {
      clearTimeout(t);
      socket.off(eventName, handler);
    }

    socket.on(eventName, handler);
  });
}

async function auctionAndWsScenario(ctx) {
  
  const socket = io(ctx.wsUrl, {
    transports: ['websocket'],
    timeout: 5000,
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WS connect timeout')), 7000);
    socket.on('connect', () => {
      clearTimeout(t);
      resolve();
    });
    socket.on('connect_error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });

  
  const pongPromise = waitForEvent(socket, 'app:pong', { timeoutMs: 5000 });
  socket.emit('app:ping');
  await pongPromise;

  
  socket.emit('join:lobby');

  
  
  
  const createdEvtPromise = waitForEvent(socket, 'auction:created', { timeoutMs: 7000 }).catch(() => null);
  const create = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auctions',
    token: ctx.user.token,
    headers: { 'x-request-id': `auction-create-${Date.now()}` },
    body: {
      title: `Auction ${Date.now()}`,
      description: 'Manual scripted test',
      totalRounds: 2,
      winnersPerRound: 2,
      roundDuration: 10,
      minBid: 10,
      minIncrement: 1,
      antiSnipingExtension: 5,
    },
  });
  eq(create.status, 201, create.text);
  has(create.json, '_id');
  isString(create.json._id);
  ctx.auction.id = create.json._id;
  eq(create.json.status, 'draft');

  // Ensure lobby got the create event (best-effort; may be null when drafts are not broadcast)
  const createdEvt = await createdEvtPromise;
  if (createdEvt) {
    isObject(createdEvt);
    eq(String(createdEvt._id), String(ctx.auction.id));
  }

  socket.emit('join:auction', { auctionId: ctx.auction.id, token: ctx.user.token });

  const snapshot = await waitForEvent(socket, 'auction:snapshot', {
    timeoutMs: 7000,
    predicate: (p) => p && p.auctionId === ctx.auction.id,
  });
  isObject(snapshot);
  eq(snapshot.auctionId, ctx.auction.id);

  // IMPORTANT: subscribe BEFORE triggering start to avoid missing fast events.
  const roundStartedPromise = waitForEvent(socket, 'round:started', {
    timeoutMs: 15000,
    predicate: (p) => p && typeof p.roundNumber === 'number' && p.roundNumber === 1,
  });

  // Start auction (admin)
  const start = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: `/auctions/${ctx.auction.id}/start`,
    token: ctx.admin.token,
    headers: { 'x-request-id': `auction-start-${Date.now()}` },
  });
  eq(start.status, 200, start.text);
  eq(start.json.status, 'active');

  const roundStarted = await roundStartedPromise;
  has(roundStarted, 'roundId');
  isString(roundStarted.roundId);

  // Current round via HTTP
  const current = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: `/auctions/${ctx.auction.id}/current-round`,
  });
  eq(current.status, 200);
  ok(current.json && current.json._id, 'Expected current round object');
  ctx.auction.roundId = current.json._id;

  // Place bid to verify bid:placed and (optionally) auction:patch
  const bidRequestId = `bid-${Date.now()}`;
  const bidPlacedEventPromise = waitForEvent(socket, 'bid:placed', { timeoutMs: 7000 });
  const patchPromise = waitForEvent(socket, 'auction:patch', { timeoutMs: 7000 }).catch(() => null);

  const deposit = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/users/me/deposit',
    token: ctx.user.token,
    body: { amount: 1000 },
  });
  eq(deposit.status, 200);

  const bid = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: `/auctions/${ctx.auction.id}/bids`,
    token: ctx.user.token,
    headers: { 'x-request-id': bidRequestId },
    body: { amount: 10, mode: 'new' },
  });
  eq(bid.status, 201, bid.text);

  const bidPlaced = await bidPlacedEventPromise;
  isObject(bidPlaced);
  eq(String(bidPlaced.auctionId), String(ctx.auction.id));

  const patch = await patchPromise;
  // Patch is produced by throttled handler and disabled only in NODE_ENV=test.
  // If it's missing in your env, we still consider core WS functional (snapshot/round/bid are verified).
  if (patch) {
    isObject(patch);
    eq(patch.auctionId, ctx.auction.id);
  }

  // Quick poll: audit should contain our requestId after bid (best-effort)
  await poll(
    async () => {
      const r = await requestJson({
        baseUrl: ctx.baseUrl,
        method: 'GET',
        path: `/admin/audit/events?requestId=${encodeURIComponent(bidRequestId)}&page=1&limit=10`,
        token: ctx.admin.token,
      });
      if (r.status !== 200) return null;
      if (r.json && Array.isArray(r.json.data) && r.json.data.length > 0) return r.json.data[0];
      return null;
    },
    { timeoutMs: 5000, intervalMs: 250 },
  );

  socket.emit('leave:auction', { auctionId: ctx.auction.id });
  socket.emit('leave:lobby');
  socket.disconnect();
}

module.exports = { auctionAndWsScenario };

