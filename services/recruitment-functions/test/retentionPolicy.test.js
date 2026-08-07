'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  RETENTION_CATEGORIES,
  categoryForApplication,
  policyForApplication,
  policyNeedsUpdate,
  validateRetentionControl
} = require('../src/retention/policy');

const config = {
  enabled: true,
  policyVersion: 'retention-v1',
  incompleteHours: 48,
  submittedDays: 365,
  maliciousDays: 30
};

test('retention category follows the strongest application state', () => {
  assert.equal(categoryForApplication({
    candidateSubmissionStatus: 'Draft',
    technicalStatus: 'UploadPending'
  }), RETENTION_CATEGORIES.Incomplete);
  assert.equal(categoryForApplication({
    candidateSubmissionStatus: 'Submitted',
    technicalStatus: 'Scanning'
  }), RETENTION_CATEGORIES.Submitted);
  assert.equal(categoryForApplication({
    candidateSubmissionStatus: 'Submitted',
    technicalStatus: 'Blocked',
    blockedAtUtc: '2026-07-22T00:00:00Z'
  }), RETENTION_CATEGORIES.Malicious);
});

test('incomplete applications use the initiated timestamp and hour duration', () => {
  const policy = policyForApplication({
    initiatedAtUtc: '2026-07-22T00:00:00.000Z',
    candidateSubmissionStatus: 'Draft',
    technicalStatus: 'UploadPending'
  }, config);
  assert.deepEqual(policy, {
    retentionCategory: 'Incomplete',
    retentionPolicyVersion: 'retention-v1',
    retentionDeleteAfterUtc: '2026-07-24T00:00:00.000Z'
  });
});

test('submitted applications use finalization and malicious cases use blocked time', () => {
  assert.equal(policyForApplication({
    finalizedAtUtc: '2026-07-22T00:00:00.000Z',
    candidateSubmissionStatus: 'Submitted',
    technicalStatus: 'Ready'
  }, config).retentionDeleteAfterUtc, '2027-07-22T00:00:00.000Z');

  assert.equal(policyForApplication({
    blockedAtUtc: '2026-07-22T00:00:00.000Z',
    candidateSubmissionStatus: 'Submitted',
    technicalStatus: 'Blocked'
  }, config).retentionDeleteAfterUtc, '2026-08-21T00:00:00.000Z');
});

test('disabled or incomplete policy configuration does not assign deadlines', () => {
  assert.equal(policyForApplication({}, { ...config, enabled: false }), null);
  assert.equal(policyForApplication({ initiatedAtUtc: 'invalid' }, config), null);
  assert.equal(policyNeedsUpdate({}, null), false);
});

test('policy changes are detected including legacy undefined legal hold', () => {
  const policy = {
    retentionCategory: 'Submitted',
    retentionPolicyVersion: 'retention-v1',
    retentionDeleteAfterUtc: '2027-07-22T00:00:00.000Z'
  };
  assert.equal(policyNeedsUpdate({ ...policy, legalHold: false }, policy), false);
  assert.equal(policyNeedsUpdate({ ...policy }, policy), true);
  assert.equal(policyNeedsUpdate({ ...policy, legalHold: false, retentionPolicyVersion: 'old' }, policy), true);
});

test('retention controls require a boolean hold and a meaningful reason', () => {
  const now = new Date('2026-07-22T00:00:00.000Z');
  assert.equal(validateRetentionControl(null, now).errorCode, 'RETENTION_CONTROL_INVALID');
  assert.equal(validateRetentionControl({ legalHold: 'yes', reason: 'long enough reason' }, now).errorCode, 'RETENTION_CONTROL_INVALID');
  assert.equal(validateRetentionControl({ legalHold: true, reason: 'short' }, now).errorCode, 'RETENTION_REASON_INVALID');
});

test('placing a legal hold does not require a deletion date', () => {
  const result = validateRetentionControl({
    legalHold: true,
    reason: 'Legal requested preservation for active proceedings.'
  }, new Date('2026-07-22T00:00:00.000Z'));
  assert.equal(result.ok, true);
  assert.equal(result.control.legalHold, true);
  assert.equal(result.control.retentionDeleteAfterUtc, null);
});

test('removing a hold requires a valid future deletion date', () => {
  const now = new Date('2026-07-22T00:00:00.000Z');
  assert.equal(validateRetentionControl({
    legalHold: false,
    reason: 'Legal confirmed the preservation requirement has ended.'
  }, now).errorCode, 'RETENTION_DATE_REQUIRED');

  const result = validateRetentionControl({
    legalHold: false,
    retentionDeleteAfterUtc: '2027-07-22T00:00:00Z',
    reason: 'Legal confirmed the preservation requirement has ended.'
  }, now);
  assert.equal(result.ok, true);
  assert.equal(result.control.retentionDeleteAfterUtc, '2027-07-22T00:00:00.000Z');
});
