const { requestJson } = require('../lib/http');
const { eq, ok, isString } = require('../lib/assert');

async function observabilityScenario(ctx) {
  
  const m = await requestJson({ baseUrl: ctx.baseUrl, method: 'GET', path: '/metrics', timeoutMs: 15000 });
  eq(m.status, 200);
  ok(typeof m.text === 'string' && m.text.includes('#'), 'Expected Prometheus text format');

  
  const rid = `script-${Date.now()}`;
  const r = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/users/me',
    token: ctx.user.token,
    headers: { 'x-request-id': rid },
  });
  eq(r.status, 200);
  eq(r.headers.get('x-request-id'), rid);

  // x-request-id generation (missing header)
  const r2 = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/users/me',
    token: ctx.user.token,
    headers: {}, // intentionally no x-request-id
  });
  eq(r2.status, 200);
  const generated = r2.headers.get('x-request-id');
  isString(generated);
}

module.exports = { observabilityScenario };

