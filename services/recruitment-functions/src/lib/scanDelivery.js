'use strict';

const { ERROR_CODES } = require('../../../../api/recruitment/core/constants');
const { normalizeEventGridEvent } = require('./eventGrid');
const { safeErrorCode } = require('./logger');

const RETRYABLE_RESULTS = new Set([
  ERROR_CODES.INFRASTRUCTURE_RETRYABLE,
  ERROR_CODES.EVENT_IN_PROGRESS
]);

function retryableError(errorCode) {
  return Object.assign(new Error('Recruitment scan processing requires retry'), {
    code: errorCode || ERROR_CODES.INFRASTRUCTURE_RETRYABLE,
    retryable: true
  });
}

async function deliverDefenderScanEvent({ event, context, config, createDependencies, processScanResult }) {
  let normalized;
  try {
    normalized = normalizeEventGridEvent(event, config);
  } catch (error) {
    context?.warn?.('recruitment_scan_event_rejected', {
      code: safeErrorCode(error, 'SCAN_EVENT_REJECTED')
    });
    return undefined;
  }

  const dependencies = createDependencies(config);
  const result = await processScanResult(normalized, dependencies);
  if (result?.success === false && RETRYABLE_RESULTS.has(result.errorCode)) {
    context?.warn?.('recruitment_scan_event_retry_requested', {
      eventId: normalized.eventId,
      fileReference: normalized.fileReference,
      errorCode: result.errorCode
    });
    throw retryableError(result.errorCode);
  }
  return result;
}

module.exports = {
  RETRYABLE_RESULTS,
  retryableError,
  deliverDefenderScanEvent
};
