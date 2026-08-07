'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  RATE_LIMIT_SCOPES,
  createRateLimiter
} = require('../src/adapters/rateLimit');

function fakeCosmos() {
  const documents = new Map();
  let etag = 0;
  const container = {
    items: {
      async create(document) {
        if (documents.has(document.id)) {
          throw Object.assign(new Error('conflict'), { code: 409 });
        }
        const stored = { ...document, _etag: String(++etag) };
        documents.set(document.id, stored);
        return { resource: { ...stored } };
      }
    },
    item(id) {
      return {
        async read() {
          return { resource: documents.get(id) || null };
        },
        async replace(document, options) {
          const current = documents.get(id);
          if (!current || options?.accessCondition?.condition !== current._etag) {
            throw Object.assign(new Error('precondition failed'), { code: 412 });
          }
          const stored = { ...document, _etag: String(++etag) };
          documents.set(id, stored);
          return { resource: { ...stored } };
        }
      };
    }
  };
  return {
    documents,
    database() {
      return { container: () => container };
    }
  };
}

function limiter({ limit = 1 } = {}) {
  const client = fakeCosmos();
  const adapter = createRateLimiter({
    client,
    enabled: true,
    limit,
    windowSeconds: 300,
    databaseId: 'recruitment',
    requestContext: {
      clientIp: '203.0.113.10',
      userAgent: 'Browser/1.0'
    },
    fingerprint: {
      async hmac(value) {
        return Buffer.from(value).toString('base64url');
      }
    },
    now: () => new Date('2026-07-23T00:01:00.000Z')
  });
  return { adapter, client };
}

test('candidate submission IDs cannot create arbitrary initiation buckets', async () => {
  const { adapter, client } = limiter();

  assert.equal((await adapter.check('candidate-controlled-id-1')).allowed, true);
  const second = await adapter.check('different-candidate-controlled-id');
  assert.equal(second.allowed, false);
  assert.equal(second.scope, RATE_LIMIT_SCOPES.initiate);
  assert.ok(second.retryAfterMs > 0);
  assert.equal(client.documents.size, 1);

  const document = [...client.documents.values()][0];
  assert.equal(document.scope, RATE_LIMIT_SCOPES.initiate);
});

test('complete and finalize use independent fixed server scopes', async () => {
  const { adapter, client } = limiter();

  assert.equal((await adapter.checkScope(RATE_LIMIT_SCOPES.complete)).allowed, true);
  assert.equal((await adapter.checkScope(RATE_LIMIT_SCOPES.finalize)).allowed, true);
  assert.equal((await adapter.checkScope(RATE_LIMIT_SCOPES.complete)).allowed, false);
  assert.equal((await adapter.checkScope(RATE_LIMIT_SCOPES.finalize)).allowed, false);

  assert.equal(client.documents.size, 2);
  assert.deepEqual(
    [...client.documents.values()].map((document) => document.scope).sort(),
    [RATE_LIMIT_SCOPES.complete, RATE_LIMIT_SCOPES.finalize].sort()
  );
});

test('unknown rate-limit scopes fail closed without creating storage records', async () => {
  const { adapter, client } = limiter();
  await assert.rejects(
    () => adapter.checkScope('candidate-defined-scope'),
    (error) => error.code === 'INTERNAL_CONFIGURATION_ERROR'
  );
  assert.equal(client.documents.size, 0);
});
