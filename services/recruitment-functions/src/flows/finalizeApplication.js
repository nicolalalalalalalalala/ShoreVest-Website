'use strict';

const {
  FILE_STATES: FILE,
  NOTIFICATION_EVENTS: EVENTS,
  ERROR_CODES
} = require('../../../../api/recruitment/core/constants');

function originalOutcomeEvent(application, file) {
  if (file.technicalStatus === FILE.Ready) {
    return {
      type: EVENTS.DocumentsReady,
      idempotencyKey: `outbox:${application.applicationReference}:documents-ready`,
      applicationReference: application.applicationReference,
      fileReference: file.fileReference
    };
  }
  if (file.technicalStatus === FILE.Malicious) {
    return {
      type: EVENTS.MaliciousFileDetected,
      idempotencyKey: `outbox:${application.applicationReference}:${file.fileReference}:malicious`,
      applicationReference: application.applicationReference,
      fileReference: file.fileReference
    };
  }
  if (file.technicalStatus === FILE.ManualReview) {
    return {
      type: EVENTS.ManualReviewRequired,
      idempotencyKey: `outbox:${application.applicationReference}:${file.fileReference}:manual-review`,
      applicationReference: application.applicationReference,
      fileReference: file.fileReference
    };
  }
  return null;
}

function outcomeEvent(application, file) {
  const original = originalOutcomeEvent(application, file);
  if (!original) return null;
  return {
    ...original,
    idempotencyKey: `${original.idempotencyKey}:after-finalization`
  };
}

function wasDeferred(record) {
  return record?.deliverySkipped === true ||
    (typeof record?.deliveryReference === 'string' && record.deliveryReference.startsWith('deferred:'));
}

function originalEventNeedsRecovery(record) {
  if (!record) return true;
  if (record.state === 'Failed') return true;
  if (record.state === 'Completed') return wasDeferred(record);
  return false;
}

async function hasEvent(dependencies, event) {
  return dependencies.applicationStore.hasOutboxEvent({
    applicationReference: event.applicationReference,
    idempotencyKey: event.idempotencyKey,
    type: event.type
  });
}

async function readOriginalEvent(dependencies, event) {
  if (!dependencies.outboxReader || typeof dependencies.outboxReader.get !== 'function') {
    const error = new Error('outbox reader is not configured');
    error.code = ERROR_CODES.INTERNAL_CONFIGURATION_ERROR;
    throw error;
  }
  return dependencies.outboxReader.get(event);
}

async function ensureOutcomeProjection(request, dependencies) {
  const application = await dependencies.applicationStore.getApplication(request.applicationReference);
  const file = await dependencies.applicationStore.getFile(request.fileReference);
  if (!application?.finalizedAtUtc || !file || file.applicationReference !== application.applicationReference) {
    return { status: 'not-applicable' };
  }

  const originalEvent = originalOutcomeEvent(application, file);
  const recoveryEvent = outcomeEvent(application, file);
  if (!originalEvent || !recoveryEvent) return { status: 'not-applicable' };
  if (await hasEvent(dependencies, recoveryEvent)) {
    return { status: 'recovery-current', event: recoveryEvent };
  }

  const originalRecord = await readOriginalEvent(dependencies, originalEvent);
  if (!originalEventNeedsRecovery(originalRecord)) {
    return {
      status: originalRecord?.state === 'Completed' ? 'original-delivered' : 'original-active',
      event: originalEvent
    };
  }

  try {
    await dependencies.applicationStore.commitAggregate({
      expectedVersion: application.aggregateVersion || 0,
      application,
      files: [file],
      outboxEvents: [recoveryEvent]
    });
    return { status: 'recovery-created', event: recoveryEvent };
  } catch (error) {
    if (await hasEvent(dependencies, recoveryEvent)) {
      return { status: 'recovery-current', event: recoveryEvent };
    }
    throw error;
  }
}

function createFinalizeApplication(coreFinalizeApplication) {
  if (typeof coreFinalizeApplication !== 'function') {
    throw new TypeError('core finalize application flow is required');
  }

  return async function finalizeApplication(request, dependencies) {
    const result = await coreFinalizeApplication(request, dependencies);
    if (result?.success !== true) return result;

    try {
      await ensureOutcomeProjection(request, dependencies);
      return result;
    } catch (error) {
      if (dependencies.logger?.log) {
        try {
          await dependencies.logger.log('finalization_outcome_reconciliation_failed', {
            applicationReference: request?.applicationReference,
            fileReference: request?.fileReference,
            errorCode: error.code || ERROR_CODES.INFRASTRUCTURE_RETRYABLE
          });
        } catch (_) {}
      }
      return {
        success: false,
        errorCode: ERROR_CODES.INFRASTRUCTURE_RETRYABLE
      };
    }
  };
}

module.exports = {
  originalOutcomeEvent,
  outcomeEvent,
  wasDeferred,
  originalEventNeedsRecovery,
  ensureOutcomeProjection,
  createFinalizeApplication
};
