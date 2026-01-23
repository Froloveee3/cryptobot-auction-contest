const crypto = require('crypto');

function makeContext(opts) {
  const baseUrl = opts.baseUrl;
  const origin = new URL(baseUrl).origin;

  return {
    baseUrl,
    origin,
    wsUrl: `${origin}/auctions`,
    admin: {
      username: opts.adminUsername,
      password: opts.adminPassword,
      token: null,
    },
    user: {
      username: opts.userUsername || `user${crypto.randomUUID().slice(0, 8)}`,
      password: opts.userPassword || 'password123',
      token: null,
      id: null,
    },
    auction: {
      id: null,
      roundId: null,
    },
  };
}

module.exports = { makeContext };

