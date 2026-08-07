'use strict';

const { NOTIFICATION_EVENTS: EVENTS } = require('../../../../api/recruitment/core/constants');

const FINALIZATION_GATED_EVENTS = new Set([
  EVENTS.DocumentsReady,
  EVENTS.ManualReviewRequired,
  EVENTS.MaliciousFileDetected,
  EVENTS.QuarantineCleanupRequired
]);

function finalizationPendingError() {
  return Object.assign(new Error('Application outcome projection requires finalization'), {
    code: 'APPLICATION_NOT_FINALIZED',
    permanent: false,
    retryable: true
  });
}

function createFinalizationGatedDispatcher(dispatcher) {
  if (!dispatcher || typeof dispatcher.deliver !== 'function') {
    throw new TypeError('outbox dispatcher is required');
  }

  return {
    ...dispatcher,
    async deliver(event, dependencies) {
      if (FINALIZATION_GATED_EVENTS.has(event?.type)) {
        const application = await dependencies?.applicationStore?.getApplication?.(
          event.applicationReference
        );
        const finalizedStatus = ['Submitted', 'Deleted'].includes(
          application?.candidateSubmissionStatus
        );
        if (!application?.finalizedAtUtc || !finalizedStatus) {
          throw finalizationPendingError();
        }
      }
      return dispatcher.deliver(event, dependencies);
    }
  };
}

module.exports = {
  FINALIZATION_GATED_EVENTS,
  finalizationPendingError,
  createFinalizationGatedDispatcher
};
