'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert');
const {
  RATE_LIMIT_SCOPES,
  SCOPE_PREFIXES,
  validScope,
  createRateLimiter
} = require('../src/adapters/rateLimit');

function fakeClient() {
  const records = new Map();
  let etag = 0;
  const container = {
    records,
    items: {
      async create(document) {
        if (records.has(document.id)) throw Object.assign(new Error('conflict'), { code: 409 });
        const stored = { ...document, _etag: String(++etag) };
        records.set(document.id, stored);
        return { resource: stored };
      }
    },
    item(id) {
      return {
        async read() {
          return { resource: records.get(id) || null };
        },
        async replace(document, options) {
          const current = records.get(id);
          if (!current || options.accessCondition.condition !== current._etag) {
            throw Object.assign(new Error('precondition failed'), { code: 412 });
          }
          const stored = { ...document, _etag: String(++etag) };
          records.set(id, stored);
          return { resource: stored };
        }
      };
    }
  };
  return {
    records,
    database() {
      return { container() { return container; } };
    }
  };
}

function fingerprint(inputs = []) {
  return {
    async hmac(canonical) {
      inputs.push(canonical);
      return crypto.createHash('sha256').update(canonical).digest('hex');
    }
  };
}

function limiter({ client, requestContext, limit = 2, inputs = [] }) {
  return createRateLimiter({
    client,
    databaseId: 'recruitment',
    enabled: true,
    limit,
    windowSeconds: 300,
    fingerprint: fingerprint(inputs),
    requestContext,
    now: () => new Date('2026-07-22T12:00:00Z')
  });
}

test('rate-limit scope set is immutable and contains only server-defined endpoints', () => {
  assert.deepEqual(RATE_LIMIT_SCOPES, {
    initiate: 'application-initiate',
    complete: 'upload-complete',
    finalize: 'application-finalize'
  });
  assert.deepEqual(SCOPE_PREFIXES, {
    'application-initiate': 'init',
    'upload-complete': 'complete',
    'application-finalize': 'finalize'
  });
  assert.equal(validScope(RATE_LIMIT_SCOPES.initiate), true);
  assert.equal(validScope('candidate-controlled-scope'), false);
});

test('core check remains permanently bound to initiation and ignores caller input', async () => {
  const inputs = [];
  const rateLimiter = limiter({
    client: fakeClient(),
    inputs,
    requestContext: { clientIp: '203.0.113.10', userAgent: 'test' }
  });

  assert.equal((await rateLimiter.check('submission-a')).allowed, true);
  assert.equal((await rateLimiter.check('submission-b')).allowed, true);
  const blocked = await rateLimiter.check('submission-c');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.scope, RATE_LIMIT_SCOPES.initiate);
  assert.ok(blocked.retryAfterMs > 0);
  assert.equal(new Set(inputs).size, 1);
  assert.deepEqual(JSON.parse(inputs[0]), {
    scope: RATE_LIMIT_SCOPES.initiate,
    identity: { clientIp: '203.0.113.10' }
  });
});

test('upload completion and finalization have independent fixed buckets', async () => {
  const client = fakeClient();
  const rateLimiter = limiter({
    client,
    limit: 1,
    requestContext: { clientIp: '203.0.113.10' }
  });

  assert.equal((await rateLimiter.checkScope(RATE_LIMIT_SCOPES.initiate)).allowed, true);
  assert.equal((await rateLimiter.checkScope(RATE_LIMIT_SCOPES.initiate)).allowed, false);
  assert.equal((await rateLimiter.checkScope(RATE_LIMIT_SCOPES.complete)).allowed, true);
  assert.equal((await rateLimiter.checkScope(RATE_LIMIT_SCOPES.complete)).allowed, false);
  assert.equal((await rateLimiter.checkScope(RATE_LIMIT_SCOPES.finalize)).allowed, true);
  assert.equal((await rateLimiter.checkScope(RATE_LIMIT_SCOPES.finalize)).allowed, false);

  const keys = [...client.records.keys()];
  assert.equal(keys.filter((key) => key.startsWith('init:')).length, 1);
  assert.equal(keys.filter((key) => key.startsWith('complete:')).length, 1);
  assert.equal(keys.filter((key) => key.startsWith('finalize:')).length, 1);
});

test('rotating user agents does not create new rate-limit buckets', async () => {
  const client = fakeClient();
  const first = limiter({
    client,
    requestContext: { clientIp: '203.0.113.10', userAgent: 'agent-a' }
  });
  const second = limiter({
    client,
    requestContext: { clientIp: '203.0.113.10', userAgent: 'agent-b' }
  });

  assert.equal((await first.check()).allowed, true);
  assert.equal((await second.check()).allowed, true);
  assert.equal((await first.check()).allowed, false);
});

test('missing platform IPs share one conservative bucket rather than attacker-chosen IDs', async () => {
  const inputs = [];
  const rateLimiter = limiter({
    client: fakeClient(),
    inputs,
    requestContext: {}
  });

  assert.equal((await rateLimiter.check('attacker-chosen-a')).allowed, true);
  assert.equal((await rateLimiter.check('attacker-chosen-b')).allowed, true);
  assert.equal((await rateLimiter.check('attacker-chosen-c')).allowed, false);
  assert.equal(new Set(inputs).size, 1);
  assert.deepEqual(JSON.parse(inputs[0]), {
    scope: RATE_LIMIT_SCOPES.initiate,
    identity: { clientIp: 'unknown-app-service-client' }
  });
});

test('different trusted client IPs use independent buckets', async () => {
  const client = fakeClient();
  const first = limiter({ client, limit: 1, requestContext: { clientIp: '203.0.113.10' } });
  const second = limiter({ client, limit: 1, requestContext: { clientIp: '203.0.113.11' } });

  assert.equal((await first.check()).allowed, true);
  assert.equal((await first.check()).allowed, false);
  assert.equal((await second.check()).allowed, true);
});

test('unknown scopes fail closed even when the limiter is disabled', async () => {
  const rateLimiter = createRateLimiter({ enabled: false });
  await assert.rejects(
    () => rateLimiter.checkScope('candidate-controlled-scope'),
    (error) => error.code === 'INTERNAL_CONFIGURATION_ERROR'
  );
});

test('disabled rate limiter is explicit and side-effect free for approved scopes', async () => {
  const rateLimiter = createRateLimiter({ enabled: false });
  assert.deepEqual(await rateLimiter.check('anything'), {
    allowed: true,
    scope: RATE_LIMIT_SCOPES.initiate
  });
  assert.deepEqual(await rateLimiter.checkScope(RATE_LIMIT_SCOPES.complete), {
    allowed: true,
    scope: RATE_LIMIT_SCOPES.complete
  });
});
