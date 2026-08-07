'use strict';

const {
  FILE_STATES: FILE,
  ERROR_CODES
} = require('../../../../api/recruitment/core/constants');

function createProcessScanResult(coreProcessScanResult) {
  if (typeof coreProcessScanResult !== 'function') {
    throw new TypeError('core scan-result flow is required');
  }

  return async function processScanResult(event, dependencies, policy) {
    const file = event?.fileReference
      ? await dependencies?.applicationStore?.getFile?.(event.fileReference)
      : null;
    if (file?.technicalStatus === FILE.SASIssued) {
      if (dependencies?.logger?.log) {
        try {
          await dependencies.logger.log('scan_result_before_upload_completion', {
            eventId: event?.eventId,
            fileReference: event?.fileReference,
            errorCode: ERROR_CODES.EVENT_IN_PROGRESS
          });
        } catch (_) {}
      }
      return {
        success: false,
        errorCode: ERROR_CODES.EVENT_IN_PROGRESS
      };
    }
    return coreProcessScanResult(event, dependencies, policy);
  };
}

module.exports = { createProcessScanResult };
