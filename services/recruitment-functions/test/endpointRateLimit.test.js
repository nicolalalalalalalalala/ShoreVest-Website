'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { RATE_LIMIT_SCOPES } = require('../src/adapters/rateLimit');
const {
  MAX_RETRY_AFTER_SECONDS,
  retryAfterSeconds,
  rateLimitedResponse,
  applyEndpointRateLimit
} = require('../src/lib/endpointRateLimit');

function request(origin = 'https://shorevest.com') {
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === 'origin' ? origin : null;
      }
    }
  };
}

function config() {
  return {
    allowedOrigins: ['https://shorevest.com'],
    requireOrigin: true
  };
}

test('retry-after values are bounded and rounded up', () => {
  assert.equal(retryAfterSeconds(1), 1);
  assert.equal(retryAfterSeconds(1001), 2);
  assert.equal(retryAfterSeconds(0), 1);
  assert.equal(retryAfterSeconds(Number.NaN), 1);
  assert.equal(retryAfterSeconds((MAX_RETRY_AFTER_SECONDS + 100) * 1000), MAX_RETRY_AFTER_SECONDS);
});

test('blocked endpoint requests return 429 with CORS and Retry-After', () => {
  const response = rateLimitedResponse(request(), config(), { retryAfterMs: 61000 });
  assert.equal(response.status, 429);
  assert.equal(response.headers['Retry-After'], '61');
  assert.equal(response.headers['Access-Control-Allow-Origin'], 'https://shorevest.com');
  assert.deepEqual(response.jsonBody, {
    success: false,
    errorCode: 'RATE_LIMITED',
    retryAfterMs: 61000
  });
});

test('endpoint helper passes only fixed server-side scopes to the limiter', async () => {
  const seen = [];
  const dependencies = {
    rateLimiter: {
      async checkScope(scope) {
        seen.push(scope);
        return { allowed: true, scope, retryAfterMs: 0 };
      },
      async check() {
        throw new Error('original core check should be replaced only for initiation');
      }
    }
  };

  for (const scope of Object.values(RATE_LIMIT_SCOPES)) {
    const result = await applyEndpointRateLimit({
      req: request(),
      config: config(),
      dependencies,
      scope,
      reuseForCoreInitiation: scope === RATE_LIMIT_SCOPES.initiate
    });
    assert.equal(result.allowed, true);
  }
  assert.deepEqual(seen, [
    RATE_LIMIT_SCOPES.initiate,
    RATE_LIMIT_SCOPES.complete,
    RATE_LIMIT_SCOPES.finalize
  ]);
});

test('initiation reuses the boundary decision instead of incrementing twice', async () => {
  let checks = 0;
  const dependencies = {
    rateLimiter: {
      async checkScope(scope) {
        checks += 1;
        return { allowed: true, scope, remaining: 4, retryAfterMs: 0 };
      },
      async check() {
        checks += 1;
        return { allowed: true };
      }
    }
  };

  const result = await applyEndpointRateLimit({
    req: request(),
    config: config(),
    dependencies,
    scope: RATE_LIMIT_SCOPES.initiate,
    reuseForCoreInitiation: true
  });
  assert.equal(result.allowed, true);
  assert.equal(checks, 1);
  assert.deepEqual(await dependencies.rateLimiter.check('attacker-chosen-submission-id'), result.decision);
  assert.equal(checks, 1);
});

test('blocked scope returns a response and never replaces the core check', async () => {
  let coreChecks = 0;
  const originalCheck = async () => {
    coreChecks += 1;
    return { allowed: true };
  };
  const dependencies = {
    rateLimiter: {
      check: originalCheck,
      async checkScope() {
        return { allowed: false, retryAfterMs: 300000 };
      }
    }
  };

  const result = await applyEndpointRateLimit({
    req: request(),
    config: config(),
    dependencies,
    scope: RATE_LIMIT_SCOPES.initiate,
    reuseForCoreInitiation: true
  });
  assert.equal(result.allowed, false);
  assert.equal(result.response.status, 429);
  assert.equal(dependencies.rateLimiter.check, originalCheck);
  assert.equal(coreChecks, 0);
});

test('unknown scopes and missing limiter implementations fail closed', async () => {
  await assert.rejects(
    () => applyEndpointRateLimit({
      req: request(),
      config: config(),
      dependencies: { rateLimiter: { async checkScope() { return { allowed: true }; } } },
      scope: 'candidate-controlled-scope'
    }),
    (error) => error.code === 'INTERNAL_CONFIGURATION_ERROR'
  );
  await assert.rejects(
    () => applyEndpointRateLimit({
      req: request(),
      config: config(),
      dependencies: {},
      scope: RATE_LIMIT_SCOPES.complete
    }),
    (error) => error.code === 'INTERNAL_CONFIGURATION_ERROR'
  );
});
