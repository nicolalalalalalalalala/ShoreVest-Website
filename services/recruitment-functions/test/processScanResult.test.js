'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  FILE_STATES: FILE,
  ERROR_CODES
} = require('../../../api/recruitment/core/constants');
const { createProcessScanResult } = require('../src/flows/processScanResult');

function event() {
  return {
    eventId: 'scan-event-1',
    fileReference: 'SV-FILE-ABC12345'
  };
}

test('Defender result before upload completion remains retryable and never reaches core processing', async () => {
  let coreCalls = 0;
  const logs = [];
  const processScanResult = createProcessScanResult(async () => {
    coreCalls += 1;
    return { success: true };
  });

  const result = await processScanResult(event(), {
    applicationStore: {
      async getFile() {
        return {
          fileReference: 'SV-FILE-ABC12345',
          technicalStatus: FILE.SASIssued
        };
      }
    },
    logger: {
      async log(name, fields) {
        logs.push({ name, fields });
      }
    }
  });

  assert.deepEqual(result, {
    success: false,
    errorCode: ERROR_CODES.EVENT_IN_PROGRESS
  });
  assert.equal(coreCalls, 0);
  assert.deepEqual(logs, [{
    name: 'scan_result_before_upload_completion',
    fields: {
      eventId: 'scan-event-1',
      fileReference: 'SV-FILE-ABC12345',
      errorCode: ERROR_CODES.EVENT_IN_PROGRESS
    }
  }]);
});

test('ScanPending and later file states continue through the authoritative core flow', async () => {
  for (const technicalStatus of [
    FILE.ScanPending,
    FILE.Ready,
    FILE.Malicious,
    FILE.ManualReview,
    FILE.ValidationFailed
  ]) {
    const calls = [];
    const processScanResult = createProcessScanResult(async (inputEvent, dependencies, policy) => {
      calls.push({ inputEvent, dependencies, policy });
      return { success: true, technicalStatus };
    });
    const dependencies = {
      applicationStore: {
        async getFile() {
          return { technicalStatus };
        }
      }
    };
    const policy = { deleteMaliciousQuarantine: false };
    const inputEvent = event();
    const result = await processScanResult(inputEvent, dependencies, policy);
    assert.deepEqual(result, { success: true, technicalStatus });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].inputEvent, inputEvent);
    assert.equal(calls[0].dependencies, dependencies);
    assert.equal(calls[0].policy, policy);
  }
});

test('missing file and lookup failures remain authoritative core or infrastructure outcomes', async () => {
  let coreCalls = 0;
  const processMissing = createProcessScanResult(async () => {
    coreCalls += 1;
    return { success: false, errorCode: ERROR_CODES.BLOB_MISMATCH };
  });
  const result = await processMissing(event(), {
    applicationStore: { async getFile() { return null; } }
  });
  assert.equal(coreCalls, 1);
  assert.deepEqual(result, { success: false, errorCode: ERROR_CODES.BLOB_MISMATCH });

  const processFailure = createProcessScanResult(async () => ({ success: true }));
  await assert.rejects(
    () => processFailure(event(), {
      applicationStore: {
        async getFile() {
          throw Object.assign(new Error('Cosmos unavailable'), {
            code: ERROR_CODES.INFRASTRUCTURE_RETRYABLE
          });
        }
      }
    }),
    (error) => error.code === ERROR_CODES.INFRASTRUCTURE_RETRYABLE
  );
});

test('scan wrapper construction rejects a missing core flow', () => {
  assert.throws(() => createProcessScanResult(), /core scan-result flow/);
});
