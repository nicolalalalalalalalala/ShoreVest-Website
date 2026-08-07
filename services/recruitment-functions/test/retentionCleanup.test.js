'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createRetentionAdapter } = require('../src/adapters/retention');

function fakeClient({ application, idempotencyRecord, failDeletes = 0 }) {
  let etag = 1;
  let remainingDeleteFailures = failDeletes;
  const submissions = new Map([[`${application.applicationReference}::application`, {
    ...application,
    _etag: application._etag || `etag-${etag++}`
  }]]);
  const idempotency = new Map([[`${idempotencyRecord.idempotencyKey}::${idempotencyRecord.id}`, {
    ...idempotencyRecord,
    _etag: `etag-${etag++}`
  }]]);

  function key(partitionKey, id) {
    return `${partitionKey}::${id}`;
  }

  const submissionsContainer = {
    items: {
      query(spec) {
        return {
          async fetchAll() {
            if (spec.query.includes('idempotencyCleanupPending')) {
              return {
                resources: [...submissions.values()]
                  .filter((item) => item.docType === 'application' &&
                    item.retentionState === 'Purged' &&
                    item.idempotencyCleanupPending === true &&
                    item.idempotencyKey)
                  .map((item) => ({ applicationReference: item.applicationReference }))
              };
            }
            return { resources: [] };
          }
        };
      }
    },
    item(id, partitionKey) {
      return {
        async read() {
          const resource = submissions.get(key(partitionKey, id));
          if (!resource) throw Object.assign(new Error('not found'), { code: 404 });
          return { resource: { ...resource } };
        },
        async replace(body, options = {}) {
          const recordKey = key(partitionKey, id);
          const current = submissions.get(recordKey);
          if (!current) throw Object.assign(new Error('not found'), { code: 404 });
          if (options.accessCondition?.condition !== current._etag) {
            throw Object.assign(new Error('precondition failed'), { code: 412 });
          }
          const resource = { ...body, _etag: `etag-${etag++}` };
          submissions.set(recordKey, resource);
          return { resource };
        }
      };
    }
  };

  const idempotencyContainer = {
    item(id, partitionKey) {
      return {
        async read() {
          const resource = idempotency.get(key(partitionKey, id));
          if (!resource) throw Object.assign(new Error('not found'), { code: 404 });
          return { resource: { ...resource } };
        },
        async delete() {
          if (remainingDeleteFailures > 0) {
            remainingDeleteFailures -= 1;
            throw Object.assign(new Error('temporary failure'), { code: 503 });
          }
          const deleted = idempotency.delete(key(partitionKey, id));
          if (!deleted) throw Object.assign(new Error('not found'), { code: 404 });
          return {};
        }
      };
    }
  };

  return {
    submissions,
    idempotency,
    database() {
      return {
        container(name) {
          return name === 'submissions' ? submissionsContainer : idempotencyContainer;
        }
      };
    }
  };
}

function purgedApplication() {
  return {
    id: 'application',
    docType: 'application',
    applicationReference: 'SV-APP-2026-ABC123',
    retentionState: 'Purged',
    retentionPurgedAtUtc: '2027-07-22T00:00:00.000Z',
    idempotencyKey: 'init:legal-assistant:uuid',
    idempotencyCleanupPending: true,
    legalHold: false
  };
}

test('failed idempotency cleanup remains durable and succeeds on retry', async () => {
  const client = fakeClient({
    application: purgedApplication(),
    idempotencyRecord: {
      id: 'init:legal-assistant:uuid',
      idempotencyKey: 'init:legal-assistant:uuid',
      state: 'CredentialsIssued'
    },
    failDeletes: 1
  });
  const adapter = createRetentionAdapter({
    client,
    databaseId: 'recruitment',
    now: () => new Date('2027-07-22T01:00:00.000Z')
  });

  await assert.rejects(
    () => adapter.cleanupIdempotency('SV-APP-2026-ABC123'),
    (error) => error.code === 503
  );

  const failedState = client.submissions.get('SV-APP-2026-ABC123::application');
  assert.equal(failedState.idempotencyCleanupPending, true);
  assert.equal(failedState.idempotencyCleanupLastErrorCode, '503');
  assert.deepEqual(await adapter.listIdempotencyCleanupCandidates({ limit: 10 }), [
    'SV-APP-2026-ABC123'
  ]);

  assert.deepEqual(await adapter.cleanupIdempotency('SV-APP-2026-ABC123'), {
    status: 'completed'
  });
  assert.equal(client.idempotency.size, 0);

  const completedState = client.submissions.get('SV-APP-2026-ABC123::application');
  assert.equal(completedState.idempotencyKey, null);
  assert.equal(completedState.idempotencyCleanupPending, false);
  assert.equal(completedState.idempotencyCleanupLastErrorCode, null);
  assert.equal(completedState.idempotencyCleanupCompletedAtUtc, '2027-07-22T01:00:00.000Z');
  assert.deepEqual(await adapter.listIdempotencyCleanupCandidates({ limit: 10 }), []);
});
