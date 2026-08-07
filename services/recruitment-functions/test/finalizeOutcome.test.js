'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  NOTIFICATION_EVENTS: EVENTS,
  ERROR_CODES
} = require('../../../api/recruitment/core/constants');
const {
  originalOutcomeEvent,
  outcomeEvent,
  wasDeferred,
  originalEventNeedsRecovery,
  ensureOutcomeProjection,
  createFinalizeApplication
} = require('../src/flows/finalizeApplication');

function application(patch = {}) {
  return {
    applicationReference: 'SV-APP-2026-ABC123',
    aggregateVersion: 4,
    finalizedAtUtc: '2026-07-22T00:05:00.000Z',
    candidateSubmissionStatus: 'Submitted',
    ...patch
  };
}

function file(patch = {}) {
  return {
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345',
    technicalStatus: 'Ready',
    ...patch
  };
}

function dependencies({
  app = application(),
  currentFile = file(),
  originalRecord = null,
  recoveryExists = false,
  commitError = null
} = {}) {
  const committed = [];
  const reads = [];
  return {
    committed,
    reads,
    applicationStore: {
      async getApplication() { return app; },
      async getFile() { return currentFile; },
      async hasOutboxEvent(input) {
        return recoveryExists || committed.some((commit) =>
          commit.outboxEvents.some((event) =>
            event.type === input.type && event.idempotencyKey === input.idempotencyKey
          )
        );
      },
      async commitAggregate(input) {
        if (commitError) throw commitError;
        committed.push(input);
        return input;
      }
    },
    outboxReader: {
      async get(event) {
        reads.push(event);
        return originalRecord;
      }
    },
    logger: { async log() {} }
  };
}

test('outcome helpers map finalized scan states to original and recovery keys', () => {
  const original = originalOutcomeEvent(application(), file());
  const recovery = outcomeEvent(application(), file());
  assert.equal(original.type, EVENTS.DocumentsReady);
  assert.equal(original.idempotencyKey, 'outbox:SV-APP-2026-ABC123:documents-ready');
  assert.equal(recovery.type, EVENTS.DocumentsReady);
  assert.equal(recovery.idempotencyKey, `${original.idempotencyKey}:after-finalization`);

  assert.equal(originalOutcomeEvent(
    application(),
    file({ technicalStatus: 'Malicious' })
  ).type, EVENTS.MaliciousFileDetected);
  assert.equal(outcomeEvent(
    application(),
    file({ technicalStatus: 'ManualReview' })
  ).type, EVENTS.ManualReviewRequired);
  assert.equal(outcomeEvent(application(), file({ technicalStatus: 'ScanPending' })), null);
});

test('only missing, failed or previously deferred original events need recovery', () => {
  assert.equal(originalEventNeedsRecovery(null), true);
  assert.equal(originalEventNeedsRecovery({ state: 'Failed' }), true);
  assert.equal(originalEventNeedsRecovery({
    state: 'Completed',
    deliverySkipped: true
  }), true);
  assert.equal(originalEventNeedsRecovery({
    state: 'Completed',
    deliveryReference: 'deferred:DocumentsReady:SV-APP-2026-ABC123'
  }), true);
  assert.equal(originalEventNeedsRecovery({ state: 'Pending' }), false);
  assert.equal(originalEventNeedsRecovery({ state: 'Processing' }), false);
  assert.equal(originalEventNeedsRecovery({
    state: 'Completed',
    deliveryReference: 'application:1|file:2'
  }), false);
  assert.equal(wasDeferred({ deliveryReference: 'application:1' }), false);
});

test('pending original scan outcome remains the only event after finalization', async () => {
  const deps = dependencies({ originalRecord: { state: 'Pending' } });
  const result = await ensureOutcomeProjection({
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345'
  }, deps);

  assert.equal(result.status, 'original-active');
  assert.equal(result.event.idempotencyKey, 'outbox:SV-APP-2026-ABC123:documents-ready');
  assert.equal(deps.committed.length, 0);
  assert.equal(deps.reads.length, 1);
});

test('already delivered original outcome does not create a second notification event', async () => {
  const deps = dependencies({
    originalRecord: {
      state: 'Completed',
      deliveryReference: 'application:1|file:2'
    }
  });
  const result = await ensureOutcomeProjection({
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345'
  }, deps);

  assert.equal(result.status, 'original-delivered');
  assert.equal(deps.committed.length, 0);
});

test('previously deferred original outcome creates one recovery event', async () => {
  const deps = dependencies({
    originalRecord: {
      state: 'Completed',
      deliveryReference: 'deferred:DocumentsReady:SV-APP-2026-ABC123'
    }
  });
  const result = await ensureOutcomeProjection({
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345'
  }, deps);

  assert.equal(result.status, 'recovery-created');
  assert.equal(deps.committed.length, 1);
  assert.equal(
    deps.committed[0].outboxEvents[0].idempotencyKey,
    'outbox:SV-APP-2026-ABC123:documents-ready:after-finalization'
  );
  assert.equal(deps.committed[0].expectedVersion, 4);
});

test('missing or failed original outcome creates one recovery event', async () => {
  for (const originalRecord of [null, { state: 'Failed' }]) {
    const deps = dependencies({ originalRecord });
    const result = await ensureOutcomeProjection({
      applicationReference: 'SV-APP-2026-ABC123',
      fileReference: 'SV-FILE-ABC12345'
    }, deps);
    assert.equal(result.status, 'recovery-created');
    assert.equal(deps.committed.length, 1);
  }
});

test('existing recovery event is not created twice', async () => {
  const deps = dependencies({ recoveryExists: true });
  const result = await ensureOutcomeProjection({
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345'
  }, deps);
  assert.equal(result.status, 'recovery-current');
  assert.equal(deps.committed.length, 0);
  assert.equal(deps.reads.length, 0);
});

test('scan-pending finalization does not create an outcome event', async () => {
  const deps = dependencies({ currentFile: file({ technicalStatus: 'ScanPending' }) });
  assert.deepEqual(await ensureOutcomeProjection({
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345'
  }, deps), { status: 'not-applicable' });
  assert.equal(deps.committed.length, 0);
});

test('wrapper returns retryable when finalization committed but recovery creation failed', async () => {
  const core = async () => ({
    success: true,
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345'
  });
  const wrapped = createFinalizeApplication(core);
  const deps = dependencies({
    originalRecord: null,
    commitError: Object.assign(new Error('Cosmos unavailable'), { code: 503 })
  });

  assert.deepEqual(await wrapped({
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345'
  }, deps), {
    success: false,
    errorCode: ERROR_CODES.INFRASTRUCTURE_RETRYABLE
  });
});

test('wrapper preserves successful core result when the original event is active', async () => {
  const coreResult = {
    success: true,
    alreadyFinalized: true,
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345',
    status: 'Ready'
  };
  const wrapped = createFinalizeApplication(async () => coreResult);
  const deps = dependencies({ originalRecord: { state: 'Pending' } });
  assert.deepEqual(await wrapped({
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345'
  }, deps), coreResult);
  assert.equal(deps.committed.length, 0);
});

test('missing outbox reader fails closed after finalization', async () => {
  const wrapped = createFinalizeApplication(async () => ({ success: true }));
  const deps = dependencies({ originalRecord: null });
  delete deps.outboxReader;

  assert.deepEqual(await wrapped({
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345'
  }, deps), {
    success: false,
    errorCode: ERROR_CODES.INFRASTRUCTURE_RETRYABLE
  });
});
