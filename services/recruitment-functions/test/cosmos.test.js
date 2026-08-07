'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  createCosmosAdapters,
  stripSystemFields,
  assertBatchSuccess,
  outboxDocument
} = require('../src/adapters/cosmos');

function etag(version) {
  return `"etag-${version}"`;
}

function fakeCosmosClient() {
  const containers = new Map();
  const batchCalls = [];
  let version = 1;

  function key(id, partitionKey) {
    return `${partitionKey}::${id}`;
  }

  function getContainer(name) {
    if (containers.has(name)) return containers.get(name);
    const records = new Map();
    const container = {
      records,
      items: {
        async create(body) {
          const partitionKey = body.applicationReference || body.idempotencyKey || body.key;
          const recordKey = key(body.id, partitionKey);
          if (records.has(recordKey)) throw Object.assign(new Error('conflict'), { code: 409 });
          const resource = { ...body, _etag: etag(version++) };
          records.set(recordKey, resource);
          return { resource };
        },
        async upsert(body) {
          const partitionKey = body.applicationReference || body.idempotencyKey || body.key;
          const resource = { ...body, _etag: etag(version++) };
          records.set(key(body.id, partitionKey), resource);
          return { resource };
        },
        async batch(operations, partitionKey) {
          batchCalls.push({ operations: JSON.parse(JSON.stringify(operations)), partitionKey });
          return {
            result: operations.map(() => ({ statusCode: 200 }))
          };
        },
        query(querySpec) {
          return {
            async fetchAll() {
              let resources = [...records.values()];
              if (querySpec.query.includes("c.docType = 'outbox'")) {
                const now = querySpec.parameters.find((item) => item.name === '@now').value;
                resources = resources.filter((item) =>
                  item.docType === 'outbox' &&
                  (item.state === 'Pending' || (item.state === 'Processing' && item.leaseExpiresAtUtc < now)) &&
                  (!item.nextAttemptAtUtc || item.nextAttemptAtUtc <= now)
                );
              } else if (querySpec.query.includes("c.docType = 'file'")) {
                resources = resources.filter((item) => item.docType === 'file' && item.quarantineRemovalPending === true);
              } else if (querySpec.query.includes('c.fileReference = @fileReference')) {
                const fileReference = querySpec.parameters.find((item) => item.name === '@fileReference').value;
                resources = resources.filter((item) => item.docType === 'file' && item.fileReference === fileReference);
              }
              return { resources };
            }
          };
        }
      },
      item(id, partitionKey) {
        return {
          async read() {
            const resource = records.get(key(id, partitionKey));
            if (!resource) throw Object.assign(new Error('not found'), { code: 404 });
            return { resource: { ...resource } };
          },
          async replace(body, options = {}) {
            const recordKey = key(id, partitionKey);
            const current = records.get(recordKey);
            if (!current) throw Object.assign(new Error('not found'), { code: 404 });
            const expected = options.accessCondition?.condition;
            if (!expected || expected !== current._etag) {
              throw Object.assign(new Error('precondition failed'), { code: 412 });
            }
            const resource = { ...body, _etag: etag(version++) };
            records.set(recordKey, resource);
            return { resource };
          },
          async patch(operations) {
            const recordKey = key(id, partitionKey);
            const current = { ...(records.get(recordKey) || {}) };
            for (const operation of operations) {
              const property = operation.path.slice(1);
              current[property] = operation.value;
            }
            current._etag = etag(version++);
            records.set(recordKey, current);
            return { resource: current };
          }
        };
      }
    };
    containers.set(name, container);
    return container;
  }

  return {
    batchCalls,
    getContainer,
    database() {
      return {
        container: getContainer,
        async read() {
          return { resource: { id: 'recruitment' } };
        }
      };
    }
  };
}

test('system metadata is not written back as application data', () => {
  assert.deepEqual(stripSystemFields({ id: 'x', value: 1, _etag: 'e', _rid: 'r', _ts: 1 }), {
    id: 'x',
    value: 1
  });
});

test('batch failures are surfaced', () => {
  assert.throws(
    () => assertBatchSuccess({ result: [{ statusCode: 200 }, { statusCode: 412 }] }),
    (error) => error.code === 412
  );
});

test('outbox documents start pending with a deterministic id', () => {
  const document = outboxDocument(
    { type: 'ApplicationReceived', idempotencyKey: 'outbox:APP-1:received' },
    'APP-1',
    '2026-07-22T00:00:00.000Z'
  );
  assert.equal(document.id, 'outbox:ApplicationReceived:outbox:APP-1:received');
  assert.equal(document.state, 'Pending');
  assert.equal(document.attemptCount, 0);
});

test('aggregate commits use transactional if-match operations', async () => {
  const client = fakeCosmosClient();
  const adapters = createCosmosAdapters({ client, databaseId: 'recruitment' });
  await adapters.applicationStore.commitAggregate({
    expectedVersion: 2,
    application: {
      id: 'application',
      applicationReference: 'APP-1',
      aggregateVersion: 2,
      technicalStatus: 'Scanning',
      _etag: etag(10)
    },
    files: [{
      id: 'file:FILE-1',
      applicationReference: 'APP-1',
      fileReference: 'FILE-1',
      technicalStatus: 'ScanPending',
      _etag: etag(11)
    }],
    outboxEvents: [{
      type: 'ApplicationReceived',
      idempotencyKey: 'outbox:APP-1:received',
      applicationReference: 'APP-1'
    }]
  });

  const call = client.batchCalls[0];
  assert.equal(call.partitionKey, 'APP-1');
  assert.equal(call.operations[0].operationType, 'Replace');
  assert.equal(call.operations[0].ifMatch, etag(10));
  assert.equal(call.operations[1].ifMatch, etag(11));
  assert.equal(call.operations[2].operationType, 'Create');
});

test('outbox claims are leased with conditional replacement', async () => {
  const clock = () => new Date('2026-07-22T00:00:00.000Z');
  const client = fakeCosmosClient();
  const submissions = client.getContainer('submissions');
  await submissions.items.create({
    id: 'outbox:ApplicationReceived:outbox:APP-1:received',
    docType: 'outbox',
    state: 'Pending',
    attemptCount: 0,
    applicationReference: 'APP-1',
    type: 'ApplicationReceived',
    idempotencyKey: 'outbox:APP-1:received'
  });

  const first = createCosmosAdapters({ client, databaseId: 'recruitment', now: clock });
  const claimed = await first.applicationStore.claimOutboxBatch({
    limit: 10,
    owner: 'worker-1',
    leaseExpiresAtUtc: '2026-07-22T00:05:00.000Z'
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].state, 'Processing');
  assert.equal(claimed[0].leaseOwner, 'worker-1');
  assert.equal(claimed[0].attemptCount, 1);

  const second = createCosmosAdapters({ client, databaseId: 'recruitment', now: clock });
  const duplicateClaim = await second.applicationStore.claimOutboxBatch({
    limit: 10,
    owner: 'worker-2',
    leaseExpiresAtUtc: '2026-07-22T00:05:00.000Z'
  });
  assert.equal(duplicateClaim.length, 0);

  const completed = await first.applicationStore.completeOutboxEvent(claimed[0], {
    deliveryReference: 'sharepoint:123'
  });
  assert.equal(completed.state, 'Completed');
  assert.equal(completed.deliveryReference, 'sharepoint:123');
});
