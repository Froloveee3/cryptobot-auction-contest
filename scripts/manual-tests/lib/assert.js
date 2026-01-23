function fail(msg) {
  const e = new Error(msg);
  e.name = 'AssertionError';
  throw e;
}

function ok(cond, msg) {
  if (!cond) fail(msg || 'Assertion failed');
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    fail(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function has(obj, key, msg) {
  ok(obj && Object.prototype.hasOwnProperty.call(obj, key), msg || `Expected key "${key}"`);
}

function isString(v, msg) {
  ok(typeof v === 'string' && v.length > 0, msg || 'Expected non-empty string');
}

function isNumber(v, msg) {
  ok(typeof v === 'number' && Number.isFinite(v), msg || 'Expected finite number');
}

function isObject(v, msg) {
  ok(v && typeof v === 'object' && !Array.isArray(v), msg || 'Expected object');
}

module.exports = { fail, ok, eq, has, isString, isNumber, isObject };

