const { requestJson } = require('../lib/http');
const { eq, has, isString } = require('../lib/assert');

async function authScenario(ctx) {
  
  const reg = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auth/register',
    headers: { 'x-request-id': `auth-register-${Date.now()}` },
    body: { username: ctx.user.username, password: ctx.user.password },
  });
  eq(reg.status, 201, `Register expected 201, got ${reg.status} (${reg.url})`);
  has(reg.json, 'accessToken');
  isString(reg.json.accessToken);
  ctx.user.token = reg.json.accessToken;

  // Login (sanity)
  const login = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auth/login',
    headers: { 'x-request-id': `auth-login-${Date.now()}` },
    body: { username: ctx.user.username, password: ctx.user.password },
  });
  eq(login.status, 200);
  has(login.json, 'accessToken');
  isString(login.json.accessToken);
  ctx.user.token = login.json.accessToken;

  // Me
  const me = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/users/me',
    token: ctx.user.token,
    headers: { 'x-request-id': `users-me-${Date.now()}` },
  });
  eq(me.status, 200);
  has(me.json, '_id');
  isString(me.json._id);
  ctx.user.id = me.json._id;

  // Admin login (bootstrap)
  const adminLogin = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'POST',
    path: '/auth/login',
    headers: { 'x-request-id': `auth-admin-${Date.now()}` },
    body: { username: ctx.admin.username, password: ctx.admin.password },
  });
  eq(adminLogin.status, 200, `Admin login failed (check ADMIN_USERNAME/ADMIN_PASSWORD): ${adminLogin.text}`);
  has(adminLogin.json, 'accessToken');
  isString(adminLogin.json.accessToken);
  ctx.admin.token = adminLogin.json.accessToken;

  // Admin-only endpoint should work for admin
  const adminOk = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/admin/audit/events?page=1&limit=1',
    token: ctx.admin.token,
  });
  eq(adminOk.status, 200, `Admin endpoint should be 200, got ${adminOk.status}: ${adminOk.text}`);

  // Admin-only endpoint should be forbidden for user
  const adminForbidden = await requestJson({
    baseUrl: ctx.baseUrl,
    method: 'GET',
    path: '/admin/audit/events?page=1&limit=1',
    token: ctx.user.token,
  });
  eq(adminForbidden.status, 403, `Expected 403 for user, got ${adminForbidden.status}: ${adminForbidden.text}`);
}

module.exports = { authScenario };

