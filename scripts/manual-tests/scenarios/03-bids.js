const { requestJson } = require('../lib/http');
const { eq, has, isString, isNumber, ok } = require('../lib/assert');

async function bidsScenario(ctx) {
  ok(ctx.auction.id, 'auctionId missing (run auction scenario first)');

  
  const dep = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/users/me/deposit',
    token: ctx.user.token,
    body: { amount: 500 },
  });
  eq(dep.status, 200);
  has(dep.json, 'balance');
  isNumber(dep.json.balance);

  
  const place = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: `/auctions/${ctx.auction.id}/bids`,
    token: ctx.user.token,
    headers: { 'x-request-id': `bid-new-${Date.now()}` },
    body: { amount: 10, mode: 'new' },
  });

  if (place.status === 201) {
    has(place.json, '_id');
    isString(place.json._id);
    eq(String(place.json.auctionId), String(ctx.auction.id));
    has(place.json, 'amount');
    isNumber(place.json.amount);
  } else {
    // If already has active bid, should be a domain error
    eq(place.status, 400);
    has(place.json, 'code');
    eq(place.json.code, 'NEW_BID_NOT_ALLOWED_WHEN_ACTIVE_EXISTS');
  }

  // Raise bid (delta)
  const raise = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: `/auctions/${ctx.auction.id}/bids`,
    token: ctx.user.token,
    headers: { 'x-request-id': `bid-raise-${Date.now()}` },
    body: { amount: 5, mode: 'raise' },
  });
  eq(raise.status, 201, raise.text);
  has(raise.json, 'amount');
  isNumber(raise.json.amount);

  // List bids
  const list = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: `/auctions/${ctx.auction.id}/bids?page=1&limit=20`,
  });
  eq(list.status, 200);
  has(list.json, 'data');
  ok(Array.isArray(list.json.data), 'Expected data[]');

  // Filter by userId
  const byUser = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: `/auctions/${ctx.auction.id}/bids?userId=${encodeURIComponent(ctx.user.id)}`,
  });
  eq(byUser.status, 200);
  ok(Array.isArray(byUser.json.data), 'Expected data[]');
}

module.exports = { bidsScenario };

