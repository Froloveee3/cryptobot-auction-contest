const { requestJson } = require('../lib/http');
const { eq, ok, has, isString } = require('../lib/assert');

async function auditOutboxScenario(ctx) {
  
  const list = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/admin/audit/events?page=1&limit=50',
    token: ctx.admin.token,
  });
  eq(list.status, 200);
  ok(Array.isArray(list.json.data), 'Expected audit data[]');
  if (list.json.data.length > 0) {
    const first = list.json.data[0];
    has(first, '_id');
    isString(first._id);
    ctx.auditEventId = first._id;
  }

  
  if (ctx.auction.id) {
    const byAuction = await requestJson({
      baseUrl: ctx.baseUrl,
      method: 'GET',
      path: `/admin/audit/events?auctionId=${encodeURIComponent(ctx.auction.id)}&page=1&limit=50`,
      token: ctx.admin.token,
    });
    eq(byAuction.status, 200);
    ok(Array.isArray(byAuction.json.data), 'Expected audit data[]');
  }

  // Get by id (if any)
  if (ctx.auditEventId) {
    const one = await requestJson({
      baseUrl: ctx.baseUrl,
      method: 'GET',
      path: `/admin/audit/events/${ctx.auditEventId}`,
      token: ctx.admin.token,
    });
    eq(one.status, 200);
    has(one.json, '_id');
  }

  // Outbox list
  const outbox = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/admin/audit/outbox?page=1&limit=50',
    token: ctx.admin.token,
  });
  eq(outbox.status, 200);
  ok(Array.isArray(outbox.json.data), 'Expected outbox data[]');
  const firstOutbox = outbox.json.data[0];
  if (firstOutbox && firstOutbox.eventId) {
    ctx.outboxEventId = firstOutbox.eventId;
  }

  // Get outbox by eventId (if any)
  if (ctx.outboxEventId) {
    const oneOutbox = await requestJson({
      baseUrl: ctx.baseUrl,
      method: 'GET',
      path: `/admin/audit/outbox/${encodeURIComponent(ctx.outboxEventId)}`,
      token: ctx.admin.token,
    });
    eq(oneOutbox.status, 200);
    has(oneOutbox.json, 'eventId');
  }

  // Dispatch kick
  const kick = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/admin/audit/outbox/dispatch',
    token: ctx.admin.token,
  });
  eq(kick.status, 200);
  has(kick.json, 'ok');
  eq(kick.json.ok, true);

  // Retry failed (optional)
  const failed = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/admin/audit/outbox?status=failed&page=1&limit=10',
    token: ctx.admin.token,
  });
  eq(failed.status, 200);
  if (Array.isArray(failed.json.data) && failed.json.data.length > 0) {
    const evId = failed.json.data[0].eventId;
    if (evId) {
      const retry = await requestJson({
        baseUrl: ctx.baseUrl,
        method: 'POST',
        path: `/admin/audit/outbox/${encodeURIComponent(evId)}/retry`,
        token: ctx.admin.token,
      });
      eq(retry.status, 200);
      has(retry.json, 'ok');
      eq(retry.json.ok, true);
    }
  }
}

module.exports = { auditOutboxScenario };

