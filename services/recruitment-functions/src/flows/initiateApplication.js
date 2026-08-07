'use strict';

const { ERROR_CODES } = require('../../../../api/recruitment/core/constants');

function configured(dependencies) {
  return Boolean(
    dependencies?.rateLimiter &&
    typeof dependencies.rateLimiter.check === 'function' &&
    dependencies?.botVerifier &&
    typeof dependencies.botVerifier.verify === 'function'
  );
}

function createInitiateApplication(coreInitiateApplication) {
  if (typeof coreInitiateApplication !== 'function') {
    throw new TypeError('core initiate application flow is required');
  }

  return async function initiateApplication(request, dependencies) {
    if (!configured(dependencies)) {
      if (dependencies?.logger?.log) {
        try {
          await dependencies.logger.log('initiate_abuse_controls_missing', {
            errorCode: ERROR_CODES.INTERNAL_CONFIGURATION_ERROR
          });
        } catch (_) {}
      }
      return {
        success: false,
        errorCode: ERROR_CODES.SUBMISSION_FAILED
      };
    }
    return coreInitiateApplication(request, dependencies);
  };
}

module.exports = {
  configured,
  createInitiateApplication
};
