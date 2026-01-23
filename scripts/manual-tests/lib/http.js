const { setTimeout: sleep } = require('timers/promises');

function withTimeout(ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error(`HTTP timeout after ${ms}ms`)), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(t) };
}

async function readBody(res) {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();
  if (contentType.includes('application/json')) {
    try {
      return { json: JSON.parse(text), text };
    } catch {
      return { json: null, text };
    }
  }
  return { json: null, text };
}

async function requestJson({ baseUrl, method, path, token, headers, body, timeoutMs = 10000 }) {
  // Important: baseUrl includes "/api". If `path` starts with "/", `new URL(path, baseUrl)`
  // would drop the "/api" part. We want "/api" to be preserved.
  // - baseUrl: "http://localhost:3000/api"
  // - path: "/metrics" => "http://localhost:3000/api/metrics"
  const isAbsolute = typeof path === 'string' && (path.startsWith('http://') || path.startsWith('https://'));
  const base = String(baseUrl || '').replace(/\/+$/, '') + '/';
  const rel = String(path || '').replace(/^\/+/, '');
  const url = isAbsolute ? String(path) : base + rel;
  const h = new Headers(headers || {});
  if (token) h.set('Authorization', `Bearer ${token}`);
  if (body !== undefined && body !== null) h.set('Content-Type', 'application/json');

  const { signal, cancel } = withTimeout(timeoutMs);
  try {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: h,
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch (e) {
      const cause = e && typeof e === 'object' ? e.cause : null;
      const code = cause && typeof cause === 'object' ? cause.code : null;
      const msg = e && e.message ? e.message : String(e);
      const extra = code ? ` (code=${code})` : '';
      throw new Error(`HTTP request failed: ${method} ${url} -> ${msg}${extra}`);
    }
    const { json, text } = await readBody(res);
    return { res, status: res.status, headers: res.headers, json, text, url };
  } finally {
    cancel();
  }
}

async function poll(fn, { timeoutMs = 5000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(intervalMs);
  }
  if (lastErr) throw lastErr;
  return null;
}

module.exports = { requestJson, poll };

