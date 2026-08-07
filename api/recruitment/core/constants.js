'use strict';

const APPLICATION_STATES = Object.freeze({
  Initiated: 'Initiated',
  UploadPending: 'UploadPending',
  Received: 'Received',
  Scanning: 'Scanning',
  Ready: 'Ready',
  ManualReview: 'ManualReview',
  Blocked: 'Blocked',
  Incomplete: 'Incomplete',
  Error: 'Error'
});

const FILE_STATES = Object.freeze({
  SASIssued: 'SASIssued',
  Uploaded: 'Uploaded',
  ValidationFailed: 'ValidationFailed',
  ScanPending: 'ScanPending',
  Clean: 'Clean',
  Ready: 'Ready',
  Malicious: 'Malicious',
  ScanFailed: 'ScanFailed',
  ManualReview: 'ManualReview',
  Removed: 'Removed'
});

const HIRING_STAGES = Object.freeze({
  New: 'New',
  UnderReview: 'UnderReview',
  Interview: 'Interview',
  Hold: 'Hold',
  Rejected: 'Rejected',
  Offer: 'Offer',
  Hired: 'Hired',
  Withdrawn: 'Withdrawn'
});

const NOTIFICATION_EVENTS = Object.freeze({
  ApplicationReceived: 'ApplicationReceived',
  CandidateAcknowledgementRequested: 'CandidateAcknowledgementRequested',
  DocumentsReady: 'DocumentsReady',
  ManualReviewRequired: 'ManualReviewRequired',
  MaliciousFileDetected: 'MaliciousFileDetected',
  QuarantineCleanupRequired: 'QuarantineCleanupRequired',
  RetentionPurged: 'RetentionPurged'
});

const SCAN_RESULTS = Object.freeze({
  Clean: 'Clean',
  Malicious: 'Malicious',
  ScanFailed: 'ScanFailed',
  Unsupported: 'Unsupported',
  Timeout: 'Timeout'
});

const SCAN_EVENT_STATES = Object.freeze({
  Processing: 'Processing',
  Completed: 'Completed',
  RetryableFailure: 'RetryableFailure',
  PermanentFailure: 'PermanentFailure'
});

const CONTAINERS = Object.freeze({
  quarantine: 'recruitment-quarantine',
  clean: 'recruitment-clean'
});

const ERROR_CODES = Object.freeze({
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  ROLE_NOT_OPEN: 'ROLE_NOT_OPEN',
  APPLICATION_DEADLINE_PASSED: 'APPLICATION_DEADLINE_PASSED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PRIVACY_VERSION_INVALID: 'PRIVACY_VERSION_INVALID',
  FILE_MISSING: 'FILE_MISSING',
  FILE_TYPE_REJECTED: 'FILE_TYPE_REJECTED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_SIGNATURE_REJECTED: 'FILE_SIGNATURE_REJECTED',
  RATE_LIMITED: 'RATE_LIMITED',
  BOT_VERIFICATION_FAILED: 'BOT_VERIFICATION_FAILED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  BLOB_NOT_FOUND: 'BLOB_NOT_FOUND',
  BLOB_MISMATCH: 'BLOB_MISMATCH',
  DUPLICATE_EVENT: 'DUPLICATE_EVENT',
  EVENT_IN_PROGRESS: 'EVENT_IN_PROGRESS',
  STATE_TRANSITION_INVALID: 'STATE_TRANSITION_INVALID',
  SUBMISSION_FAILED: 'SUBMISSION_FAILED',
  SUBMISSION_IN_PROGRESS: 'SUBMISSION_IN_PROGRESS',
  INFRASTRUCTURE_RETRYABLE: 'INFRASTRUCTURE_RETRYABLE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  RESERVATION_INTEGRITY_CONFLICT: 'RESERVATION_INTEGRITY_CONFLICT',
  INTERNAL_CONFIGURATION_ERROR: 'INTERNAL_CONFIGURATION_ERROR'
});

module.exports = {
  APPLICATION_STATES,
  FILE_STATES,
  HIRING_STAGES,
  NOTIFICATION_EVENTS,
  SCAN_RESULTS,
  SCAN_EVENT_STATES,
  CONTAINERS,
  ERROR_CODES
};
