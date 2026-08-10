'use strict';

const { authorizeHr } = require('../lib/hrAuth');
const { validReference } = require('./documentAccess');

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

function safeFile(file) {
  const clean = file?.technicalStatus === 'Ready' &&
    file?.scanResult === 'Clean' &&
    Boolean(file?.cleanBlobPath);
  return {
    fileReference: file?.fileReference || null,
    filePurpose: file?.filePurpose || null,
    originalFileName: file?.originalFileName || null,
    contentType: file?.declaredMimeType || null,
    sizeBytes: Number.isFinite(file?.sizeBytes) ? file.sizeBytes : null,
    technicalStatus: file?.technicalStatus || null,
    scanResult: file?.scanResult || null,
    readyAtUtc: file?.readyAtUtc || null,
    availableForHrAccess: clean
  };
}

async function getApplicationDetails(req, config, dependencies) {
  const authorization = authorizeHr(req, config);
  if (!authorization.ok) {
    return response(authorization.status, authorization.errorCode);
  }

  const applicationReference = req?.params?.applicationReference;
  if (!validReference(applicationReference)) {
    return response(400, 'REFERENCE_INVALID');
  }

  if (!dependencies?.applicationStore || typeof dependencies.applicationStore.getApplication !== 'function') {
    return response(503, 'HR_APPLICATION_STORE_UNAVAILABLE');
  }
  if (!dependencies?.projectionReader || typeof dependencies.projectionReader.getFilesForApplication !== 'function') {
    return response(503, 'HR_FILE_INDEX_UNAVAILABLE');
  }

  const application = await dependencies.applicationStore.getApplication(applicationReference);
  if (!application) return response(404, 'APPLICATION_NOT_FOUND');
  if (!application.finalizedAtUtc || application.candidateSubmissionStatus !== 'Submitted') {
    return response(409, 'APPLICATION_NOT_FINALIZED');
  }

  const files = await dependencies.projectionReader.getFilesForApplication(applicationReference);
  const result = response(200, null, {
    application: {
      applicationReference: application.applicationReference,
      roleId: application.roleId || null,
      roleTitle: application.roleTitle || null,
      roleDepartment: application.roleDepartment || null,
      roleLocation: application.roleLocation || null,
      candidateName: application.candidateName || null,
      candidateEmail: application.candidateEmail || null,
      candidateTelephone: application.candidateTelephone || null,
      candidateLocation: application.candidateLocation || null,
      linkedInUrl: application.linkedInUrl || null,
      coverNote: application.coverNote || null,
      source: application.source || null,
      finalizedAtUtc: application.finalizedAtUtc,
      hiringStage: application.hiringStage || null
    },
    files: (Array.isArray(files) ? files : []).map(safeFile)
  });

  if (dependencies.logger?.log) {
    await dependencies.logger.log('hr_application_details_accessed', {
      applicationReference,
      principalObjectId: authorization.principal.objectId,
      fileCount: result.jsonBody.files.length
    });
  }

  return result;
}

module.exports = {
  safeFile,
  getApplicationDetails
};
