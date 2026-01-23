/* eslint-disable no-console */
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const { makeContext } = require('./lib/context');

const { authScenario } = require('./scenarios/01-auth');
const { auctionAndWsScenario } = require('./scenarios/02-auction-ws');
const { bidsScenario } = require('./scenarios/03-bids');
const { auditOutboxScenario } = require('./scenarios/04-audit-outbox');
const { observabilityScenario } = require('./scenarios/05-observability');
const { adminQueuesScenario } = require('./scenarios/06-admin-queues');
const { botsScenario } = require('./scenarios/07-bots');
const { edgeCasesScenario } = require('./scenarios/08-edge-cases');
const { profileScenario } = require('./scenarios/09-profile');
const { requestJson } = require('./lib/http');

function now() {
  return new Date().toISOString();
}

async function runStep(name, fn) {
  const started = Date.now();
  process.stdout.write(`[${now()}] ${name} ... `);
  try {
    await fn();
    const ms = Date.now() - started;
    console.log(`OK (${ms}ms)`);
    return { name, ok: true, ms };
  } catch (e) {
    const ms = Date.now() - started;
    console.log(`FAIL (${ms}ms)`);
    console.error(e && e.stack ? e.stack : e);
    return { name, ok: false, ms, error: e };
  }
}

async function main() {
  const baseUrl = process.env.MANUAL_TEST_BASE_URL || 'http://localhost:3000/api';
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  // Align with docker-compose.yml defaults (ADMIN_PASSWORD defaults to "adminadmin")
  const adminPassword = process.env.ADMIN_PASSWORD || 'adminadmin';
  const continueOnFail = String(process.env.MANUAL_TEST_CONTINUE_ON_FAIL || '').toLowerCase() === 'true';

  const ctx = makeContext({ baseUrl, adminUsername, adminPassword });

  console.log(`[${now()}] Manual scripted tests`);
  console.log(`- baseUrl: ${ctx.baseUrl}`);
  console.log(`- wsUrl:   ${ctx.wsUrl}`);
  console.log(`- user:    ${ctx.user.username}`);

  // Preflight: API must be reachable
  try {
    const ping = await requestJson({ baseUrl: ctx.baseUrl, method: 'GET', path: '/metrics', timeoutMs: 3000 });
    if (ping.status !== 200) {
      throw new Error(`metrics returned status ${ping.status}`);
    }
  } catch (e) {
    console.log('');
    console.error(`Backend is not reachable at ${ctx.baseUrl}.`);
    console.error('Start the stack, then rerun this script. Examples:');
    console.error('- docker compose --profile dev up -d mongodb redis mongodb-init backend backend-worker');
    console.error('- or: npm run dev:both-local   (backend on host, infra in docker)');
    console.log('');
    console.error(e && e.stack ? e.stack : e);
    process.exitCode = 1;
    return;
  }

  const results = [];

  const steps = [
    ['01-auth', () => authScenario(ctx)],
    ['02-auction + ws', () => auctionAndWsScenario(ctx)],
    ['03-bids', () => bidsScenario(ctx)],
    ['09-profile', () => profileScenario(ctx)],
    ['04-audit + outbox', () => auditOutboxScenario(ctx)],
    ['05-observability', () => observabilityScenario(ctx)],
    ['06-admin-queues', () => adminQueuesScenario(ctx)],
    ['07-bots', () => botsScenario(ctx)],
    ['08-edge-cases', () => edgeCasesScenario(ctx)],
  ];

  for (const [name, fn] of steps) {
    // eslint-disable-next-line no-await-in-loop
    const r = await runStep(name, fn);
    results.push(r);
    if (!r.ok && !continueOnFail) break;
  }

  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log('=== Summary ===');
  for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name} (${r.ms}ms)`);
  }
  if (failed.length > 0) {
    console.log('');
    console.log(`FAILED: ${failed.length}/${results.length}`);
    process.exitCode = 1;
  } else {
    console.log('');
    console.log(`ALL OK: ${results.length}/${results.length}`);
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});

