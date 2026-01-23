const { ok, eq, has, isObject, isString, isNumber } = require('../lib/assert');
const { requestJson } = require('../lib/http');

function validatePaginated(result) {
  isObject(result);
  has(result, 'data');
  has(result, 'page');
  has(result, 'limit');
  has(result, 'total');
  has(result, 'totalPages');
  ok(Array.isArray(result.data), 'Expected data[]');
  isNumber(result.page);
  isNumber(result.limit);
  isNumber(result.total);
  isNumber(result.totalPages);
}

async function profileScenario(ctx) {
  ok(ctx.user && ctx.user.token, 'Expected ctx.user.token (run 01-auth first)');

  const bids = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/users/me/bids?page=1&limit=5',
    token: ctx.user.token,
  });
  eq(bids.status, 200);
  validatePaginated(bids.json);
  if (bids.json.data[0]) {
    const b = bids.json.data[0];
    has(b, 'id');
    has(b, 'auctionId');
    has(b, 'userId');
    has(b, 'amount');
    has(b, 'status');
    has(b, 'timestamp');
    isString(String(b.id));
    isString(String(b.auctionId));
    isString(String(b.userId));
    isNumber(Number(b.amount));
  }

  const txs = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/users/me/transactions?page=1&limit=5',
    token: ctx.user.token,
  });
  eq(txs.status, 200);
  validatePaginated(txs.json);
  if (txs.json.data[0]) {
    const t = txs.json.data[0];
    has(t, 'id');
    has(t, 'type');
    has(t, 'amount');
    has(t, 'balanceBefore');
    has(t, 'balanceAfter');
    has(t, 'createdAt');
  }

  const collection = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/users/me/collection?page=1&limit=5',
    token: ctx.user.token,
  });
  eq(collection.status, 200);
  validatePaginated(collection.json);
  if (collection.json.data[0]) {
    const g = collection.json.data[0];
    has(g, 'id');
    has(g, 'auctionId');
    has(g, 'giftNumber');
    has(g, 'wonRoundNumber');
    has(g, 'wonAt');
  }
}

module.exports = { profileScenario };

