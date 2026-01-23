


const dbName = `auction_e2e_${Date.now()}_${Math.random().toString(16).slice(2)}`;

process.env.NODE_ENV = 'test';
process.env.API_PREFIX = 'api';

// Keep dev-friendly.
process.env.CORS_ORIGIN = '*';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e_test_secret_change_me';

// Disable rate limiting in tests to avoid flaky 429s.
process.env.RATE_LIMIT_DISABLED = 'true';

// Point to local docker infra (recommended to have mongo+redis up).
// IMPORTANT: force override for tests to avoid leaking dev/docker hostname like "mongodb".
process.env.MONGODB_URI =
  process.env.E2E_MONGODB_URI ||
  // directConnection=true is REQUIRED in docker-only RS host config (member host is "mongodb"),
  // otherwise the driver tries to resolve "mongodb" from the host machine and fails.
  `mongodb://admin:password@localhost:27017/${dbName}?authSource=admin&replicaSet=rs0&directConnection=true`;

process.env.REDIS_HOST = process.env.E2E_REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.E2E_REDIS_PORT || '6379';
process.env.REDIS_PASSWORD = process.env.E2E_REDIS_PASSWORD || 'redis_password';
process.env.REDIS_DB = process.env.E2E_REDIS_DB || '14';


process.env.QUEUE_REDIS_HOST = process.env.E2E_QUEUE_REDIS_HOST || process.env.REDIS_HOST;
process.env.QUEUE_REDIS_PORT = process.env.E2E_QUEUE_REDIS_PORT || process.env.REDIS_PORT;
process.env.QUEUE_REDIS_PASSWORD = process.env.E2E_QUEUE_REDIS_PASSWORD || process.env.REDIS_PASSWORD;
process.env.QUEUE_REDIS_DB = process.env.E2E_QUEUE_REDIS_DB || '15';


process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminadmin';

