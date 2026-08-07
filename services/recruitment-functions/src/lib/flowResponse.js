'use strict';

const { withCors, candidate } = require('./http');
const { retryAfterSeconds } = require('./endpointRateLimit');

const STATUS_BY_ERROR_CODE = Object.freeze({
  RATE_LIMITED: 429,
  SUBMISSION_IN_PROGRESS: 409,
  EVENT_IN_PROGRESS: 409,
  IDEMPOTENCY_CONFLICT: 409,
  RESERVATION_INTEGRITY_CONFLICT: 409,
  STATE_TRANSITION_INVALID: 409,
  INFRASTRUCTURE_RETRYABLE: 503,
  SUBMISSION_FAILED: 500,
  INTERNAL_CONFIGURATION_ERROR: 500
});

const RETRY_AFTER_CODES = new Set([
  'RATE_LIMITED',
  'SUBMISSION_IN_PROGRESS',
  'EVENT_IN_PROGRESS',
  'INFRASTRUCTURE_RETRYABLE'
]);

function statusForResult(result) {
  if (result?.success === true) return 200;
  return STATUS_BY_ERROR_CODE[result?.errorCode] || 400;
}

function headersForResult(req, config, result) {
  const extra = {};
  if (RETRY_AFTER_CODES.has(result?.errorCode)) {
    extra['Retry-After'] = String(retryAfterSeconds(result?.retryAfterMs));
  }
  return withCors(req, config, extra);
}

function flowHttpResponse(req, config, result) {
  const safeResult = candidate(result);
  return {
    status: statusForResult(safeResult),
    headers: headersForResult(req, config, safeResult),
    jsonBody: safeResult
  };
}

module.exports = {
  STATUS_BY_ERROR_CODE,
  RETRY_AFTER_CODES,
  statusForResult,
  headersForResult,
  flowHttpResponse
};
