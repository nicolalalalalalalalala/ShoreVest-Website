'use strict';

const { authorizeRetentionAdmin } = require('../lib/hrAuth');
const { validateRetentionControl } = require('../retention/policy');

const REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9-]{5,80}$/;

function response(status, errorCode, extra = {}) {
  return {
    status,
    jsonBody: {
      success: status >= 200 && status < 300,
      ...(errorCode ? { errorCode } : {}),
      ...extra
    }
  };
}

async function updateRetentionControl(req, config, dependencies, body) {
  const authorization = authorizeRetentionAdmin(req, config);
  if (!authorization.ok) {
    return response(authorization.status, authorization.errorCode);
  }

  const applicationReference = req?.params?.applicationReference;
  if (typeof applicationReference !== 'string' || !REFERENCE_PATTERN.test(applicationReference)) {
    return response(400, 'REFERENCE_INVALID');
  }

  const now = await dependencies.now();
  const validation = validateRetentionControl(body, now);
  if (!validation.ok) {
    return response(400, validation.errorCode);
  }

  let updated;
  try {
    updated = await dependencies.retention.updateControls({
      applicationReference,
      ...validation.control,
      principalObjectId: authorization.principal.objectId
    });
  } catch (error) {
    if (error.code === 'RETENTION_PURGE_IN_PROGRESS' ||
      Number(error.code) === 412 ||
      Number(error.statusCode) === 409 ||
      Number(error.statusCode) === 412) {
      return response(409, 'RETENTION_PURGE_IN_PROGRESS');
    }
    throw error;
  }
  if (!updated) {
    return response(404, 'APPLICATION_NOT_FOUND');
  }

  if (dependencies.logger?.log) {
    await dependencies.logger.log('retention_control_updated', {
      applicationReference,
      legalHold: updated.legalHold,
      retentionDeleteAfterUtc: updated.retentionDeleteAfterUtc,
      principalObjectId: authorization.principal.objectId,
      reason: validation.control.reason
    });
  }

  return response(200, null, {
    applicationReference,
    legalHold: updated.legalHold,
    retentionDeleteAfterUtc: updated.retentionDeleteAfterUtc,
    retentionPolicyVersion: updated.retentionPolicyVersion,
    retentionState: updated.retentionState
  });
}

module.exports = {
  REFERENCE_PATTERN,
  updateRetentionControl
};
