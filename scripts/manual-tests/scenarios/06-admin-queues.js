const { requestJson } = require('../lib/http');
const { eq } = require('../lib/assert');

async function adminQueuesScenario(ctx) {
  const health = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/admin/queues/bid-intake/health',
    token: ctx.admin.token,
  });
  eq(health.status, 200, health.text);
}

module.exports = { adminQueuesScenario };

