'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createOutboxReader } = require('../src/adapters/outboxReader');

function client(read) {
  return {
    database() {
      return {
        container(name) {
          assert.equal(name, 'submissions');
          return {
            item(id, partitionKey) {
              return {
                async read() {
                  return read({ id, partitionKey });
                }
              };
            }
          };
        }
      };
    }
  };
}

test('outbox reader resolves the deterministic document id in the application partition', async () => {
  const calls = [];
  const reader = createOutboxReader({
    client: client(async (input) => {
      calls.push(input);
      return { resource: { state: 'Pending' } };
    }),
    databaseId: 'recruitment'
  });

  assert.deepEqual(await reader.get({
    applicationReference: 'SV-APP-2026-ABC123',
    idempotencyKey: 'outbox:SV-APP-2026-ABC123:documents-ready',
    type: 'DocumentsReady'
  }), { state: 'Pending' });
  assert.deepEqual(calls, [{
    id: 'outbox:DocumentsReady:outbox:SV-APP-2026-ABC123:documents-ready',
    partitionKey: 'SV-APP-2026-ABC123'
  }]);
});

test('outbox reader maps missing documents to null', async () => {
  const reader = createOutboxReader({
    client: client(async () => {
      throw Object.assign(new Error('not found'), { code: 404 });
    }),
    databaseId: 'recruitment'
  });

  assert.equal(await reader.get({
    applicationReference: 'SV-APP-2026-ABC123',
    idempotencyKey: 'event-key',
    type: 'DocumentsReady'
  }), null);
});

test('outbox reader rejects incomplete identities and propagates infrastructure failures', async () => {
  const reader = createOutboxReader({
    client: client(async () => {
      throw Object.assign(new Error('unavailable'), { code: 503 });
    }),
    databaseId: 'recruitment'
  });

  await assert.rejects(
    () => reader.get({ applicationReference: 'APP' }),
    /outbox identity/
  );
  await assert.rejects(
    () => reader.get({
      applicationReference: 'SV-APP-2026-ABC123',
      idempotencyKey: 'event-key',
      type: 'DocumentsReady'
    }),
    (error) => error.code === 503
  );
});
