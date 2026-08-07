'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createRetentionAdapter } = require('../src/adapters/retention');

function clientFixture() {
  const application = {
    id: 'application',
    docType: 'application',
    applicationReference: 'SV-APP-2026-123456',
    aggregateVersion: 3,
    retentionState: 'Processing',
    retentionLeaseOwner: 'dead-worker',
    retentionLeaseExpiresAtUtc: '2026-07-22T00:30:00.000Z',
    retentionDeleteAfterUtc: '2026-07-22T00:00:00.000Z',
    legalHold: false,
    _etag: 'application-etag'
  };
  const file = {
    id: 'file:SV-FILE-12345678',
    docType: 'file',
    applicationReference: application.applicationReference,
    fileReference: 'SV-FILE-12345678',
    retentionState: 'Active',
    retentionDeleteAfterUtc: application.retentionDeleteAfterUtc,
    legalHold: false,
    _etag: 'file-etag'
  };
  let batchOperations = null;

  const submissions = {
    item(id, partitionKey) {
      return {
        async read() {
          if (id === 'application' && partitionKey === application.applicationReference) {
            return { resource: { ...application } };
          }
          throw Object.assign(new Error('not found'), { code: 404 });
        }
      };
    },
    items: {
      query(spec, options) {
        return {
          async fetchAll() {
            assert.equal(options.partitionKey, application.applicationReference);
            assert.ok(spec.query.includes("c.docType = @type"));
            return { resources: [{ ...file }] };
          }
        };
      },
      async batch(operations, partitionKey) {
        assert.equal(partitionKey, application.applicationReference);
        batchOperations = operations;
        return { result: operations.map(() => ({ statusCode: 200 })) };
      }
    }
  };

  return {
    application,
    file,
    get batchOperations() { return batchOperations; },
    client: {
      database() {
        return {
          container(name) {
            if (name === 'submissions') return submissions;
            return { item() { throw new Error('idempotency not expected'); } };
          }
        };
      }
    }
  };
}

test('expired purge lease can be atomically replaced with a legal hold', async () => {
  const fixture = clientFixture();
  const adapter = createRetentionAdapter({
    client: fixture.client,
    databaseId: 'recruitment',
    now: () => new Date('2026-07-22T01:00:00.000Z')
  });

  const updated = await adapter.updateControls({
    applicationReference: fixture.application.applicationReference,
    legalHold: true,
    reason: 'Legal preservation request received after the deletion lease expired.',
    principalObjectId: 'legal-admin-object-id'
  });

  assert.equal(updated.legalHold, true);
  assert.equal(updated.retentionState, 'Active');
  assert.equal(updated.retentionLeaseOwner, null);
  assert.equal(updated.retentionLeaseExpiresAtUtc, null);
  assert.equal(updated.retentionControlledByObjectId, 'legal-admin-object-id');

  assert.equal(fixture.batchOperations.length, 2);
  const applicationWrite = fixture.batchOperations[0];
  const fileWrite = fixture.batchOperations[1];
  assert.equal(applicationWrite.ifMatch, 'application-etag');
  assert.equal(applicationWrite.resourceBody.legalHold, true);
  assert.equal(fileWrite.ifMatch, 'file-etag');
  assert.equal(fileWrite.resourceBody.legalHold, true);
});
