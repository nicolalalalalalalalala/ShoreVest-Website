'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { ERROR_CODES } = require('../../../api/recruitment/core/constants');
const {
  RETRYABLE_RESULTS,
  retryableError,
  deliverDefenderScanEvent
} = require('../src/lib/scanDelivery');

const APPLICATION_REFERENCE = 'SV-APP-2026-ABCDEF0123456789';
const FILE_REFERENCE = 'SV-FILE-0123456789ABCDEF';

function context() {
  const warnings = [];
  return {
    warnings,
    warn(event, fields) {
      warnings.push({ event, fields });
    }
  };
}

function validEvent() {
  return {
    id: 'scan-event-1',
    eventType: 'Microsoft.Security.MalwareScanningResult',
    eventTime: '2026-07-23T00:00:00.000Z',
    data: {
      blobUri: `https://account.blob.core.windows.net/recruitment-quarantine/recruitment/2026/legal-assistant/${APPLICATION_REFERENCE}/${FILE_REFERENCE}.pdf`,
      scanResultType: 'No threats found',
      scanFinishedTimeUtc: '2026-07-23T00:00:00.000Z',
      blobETag: 'etag-1',
      sha256: 'a'.repeat(64)
    }
  };
}

function config() {
  return {
    uploadStorageAccountName: 'account',
    quarantineContainer: 'recruitment-quarantine'
  };
}

test('malformed Defender events are acknowledged with a generic code only', async () => {
  const ctx = context();
  const result = await deliverDefenderScanEvent({
    event: {
      eventType: 'Microsoft.Security.MalwareScanningResult',
      data: {
        blobUri: 'https://account.blob.core.windows.net/private-candidate-path.pdf'
      }
    },
    context: ctx,
    config: config(),
    createDependencies() {
      throw new Error('should not run');
    },
    async processScanResult() {
      throw new Error('should not run');
    }
  });

  assert.equal(result, undefined);
  assert.deepEqual(ctx.warnings, [{
    event: 'recruitment_scan_event_rejected',
    fields: { code: 'SCAN_EVENT_REJECTED' }
  }]);
  assert.equal(JSON.stringify(ctx.warnings).includes('private-candidate-path'), false);
});

test('retryable scan outcomes throw so Event Grid redelivers the event', async () => {
  for (const errorCode of RETRYABLE_RESULTS) {
    const ctx = context();
    await assert.rejects(
      () => deliverDefenderScanEvent({
        event: validEvent(),
        context: ctx,
        config: config(),
        createDependencies: () => ({ marker: true }),
        processScanResult: async (normalized, dependencies) => {
          assert.equal(normalized.applicationReference, APPLICATION_REFERENCE);
          assert.equal(normalized.fileReference, FILE_REFERENCE);
          assert.equal(normalized.result, 'Clean');
          assert.equal(dependencies.marker, true);
          return { success: false, errorCode };
        }
      }),
      (error) => error.code === errorCode && error.retryable === true
    );
    assert.equal(ctx.warnings[0].event, 'recruitment_scan_event_retry_requested');
    assert.equal(ctx.warnings[0].fields.errorCode, errorCode);
  }
});

test('permanent scan outcomes are returned without requesting redelivery', async () => {
  const ctx = context();
  const result = await deliverDefenderScanEvent({
    event: validEvent(),
    context: ctx,
    config: config(),
    createDependencies: () => ({}),
    processScanResult: async () => ({
      success: false,
      errorCode: ERROR_CODES.BLOB_MISMATCH
    })
  });

  assert.deepEqual(result, {
    success: false,
    errorCode: ERROR_CODES.BLOB_MISMATCH
  });
  assert.deepEqual(ctx.warnings, []);
});

test('successful scan outcomes return normally', async () => {
  const expected = { success: true, reconciled: true };
  const result = await deliverDefenderScanEvent({
    event: validEvent(),
    context: context(),
    config: config(),
    createDependencies: () => ({}),
    processScanResult: async () => expected
  });
  assert.equal(result, expected);
});

test('dependency-construction failures propagate to Event Grid', async () => {
  await assert.rejects(
    () => deliverDefenderScanEvent({
      event: validEvent(),
      context: context(),
      config: config(),
      createDependencies() {
        throw Object.assign(new Error('Cosmos unavailable'), {
          code: ERROR_CODES.INFRASTRUCTURE_RETRYABLE
        });
      },
      processScanResult: async () => ({ success: true })
    }),
    (error) => error.code === ERROR_CODES.INFRASTRUCTURE_RETRYABLE
  );
});

test('retryable error helper uses a controlled fallback code', () => {
  assert.equal(retryableError().code, ERROR_CODES.INFRASTRUCTURE_RETRYABLE);
  assert.equal(retryableError(ERROR_CODES.EVENT_IN_PROGRESS).retryable, true);
});
