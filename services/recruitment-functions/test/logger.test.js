'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  MAX_STRING_LENGTH,
  safeEventName,
  safeErrorCode,
  sanitizeFields,
  createStructuredLogger
} = require('../src/lib/logger');

test('structured logger emits allowlisted non-PII fields only', async () => {
  const lines = [];
  const logger = createStructuredLogger({
    sink: { log: (line) => lines.push(line) },
    now: () => new Date('2026-07-23T01:02:03.000Z')
  });

  const payload = await logger.log('finalize_application', {
    applicationReference: 'SV-APP-2026-ABC123',
    roleId: 'legal-assistant',
    errorCode: 'INFRASTRUCTURE_RETRYABLE',
    candidateEmail: 'candidate@example.com',
    candidateName: 'Candidate Name',
    quarantineBlobPath: 'recruitment/private/path.pdf',
    completionToken: 'secret-token',
    requestFingerprint: 'secret-fingerprint'
  });

  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), payload);
  assert.equal(payload.timestampUtc, '2026-07-23T01:02:03.000Z');
  assert.equal(payload.event, 'finalize_application');
  assert.equal(payload.applicationReference, 'SV-APP-2026-ABC123');
  assert.equal(payload.roleId, 'legal-assistant');
  assert.equal(payload.errorCode, 'INFRASTRUCTURE_RETRYABLE');
  assert.equal(payload.candidateEmail, undefined);
  assert.equal(payload.candidateName, undefined);
  assert.equal(payload.quarantineBlobPath, undefined);
  assert.equal(payload.completionToken, undefined);
  assert.equal(payload.requestFingerprint, undefined);
});

test('structured logger bounds strings and normalizes unsafe event names', () => {
  const fields = sanitizeFields({
    applicationReference: 'x'.repeat(MAX_STRING_LENGTH + 20),
    attemptCount: 3,
    legalHold: true,
    nested: { unsafe: true }
  });

  assert.equal(fields.applicationReference.length, MAX_STRING_LENGTH);
  assert.equal(fields.attemptCount, 3);
  assert.equal(fields.legalHold, true);
  assert.equal(fields.nested, undefined);
  assert.equal(safeEventName('Finalize Application!'), 'recruitment_event');
  assert.equal(safeEventName('valid_event_2'), 'valid_event_2');
});

test('error-code sanitizer never returns exception messages or paths', () => {
  assert.equal(safeErrorCode({ code: 'BLOB_MISMATCH' }), 'BLOB_MISMATCH');
  assert.equal(
    safeErrorCode({ code: '/recruitment/private/candidate.pdf' }, 'SCAN_EVENT_REJECTED'),
    'SCAN_EVENT_REJECTED'
  );
  assert.equal(
    safeErrorCode(new Error('wrong blob path: recruitment/private/candidate.pdf'), 'SCAN_EVENT_REJECTED'),
    'SCAN_EVENT_REJECTED'
  );
  assert.equal(sanitizeFields({ errorCode: 'not a safe code' }).errorCode, 'UNEXPECTED_ERROR');
});

test('structured logger rejects an invalid sink', () => {
  assert.throws(() => createStructuredLogger({ sink: {} }), /logger sink/);
});
