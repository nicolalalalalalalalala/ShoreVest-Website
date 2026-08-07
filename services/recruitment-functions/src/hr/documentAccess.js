'use strict';

const { authorizeHr } = require('../lib/hrAuth');

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

function validReference(value) {
  return typeof value === 'string' && REFERENCE_PATTERN.test(value);
}

async function accessCleanDocument(req, config, dependencies) {
  const authorization = authorizeHr(req, config);
  if (!authorization.ok) {
    return response(authorization.status, authorization.errorCode);
  }

  const applicationReference = req?.params?.applicationReference;
  const fileReference = req?.params?.fileReference;
  if (!validReference(applicationReference) || !validReference(fileReference)) {
    return response(400, 'REFERENCE_INVALID');
  }

  const application = await dependencies.applicationStore.getApplication(applicationReference);
  const file = await dependencies.applicationStore.getFile(fileReference);
  if (!application || !file || file.applicationReference !== application.applicationReference) {
    return response(404, 'DOCUMENT_NOT_FOUND');
  }
  if (!application.finalizedAtUtc || application.candidateSubmissionStatus !== 'Submitted') {
    return response(409, 'APPLICATION_NOT_FINALIZED');
  }
  if (file.technicalStatus !== 'Ready' || file.scanResult !== 'Clean' || !file.cleanBlobPath || !file.expectedHash) {
    return response(409, 'DOCUMENT_NOT_READY');
  }

  const verified = await dependencies.storage.verify({
    container: config.cleanContainer,
    path: file.cleanBlobPath,
    expectedSizeBytes: file.sizeBytes,
    expectedContentType: file.declaredMimeType,
    expectedHash: file.expectedHash,
    maxBytes: file.sizeBytes
  });
  if (!verified?.ok) {
    return response(409, 'CLEAN_DOCUMENT_MISMATCH');
  }

  const now = await dependencies.now();
  const expiresAtUtc = new Date(now.getTime() + config.hrAccess.readSasSeconds * 1000).toISOString();
  const access = await dependencies.storage.issueRead({
    container: config.cleanContainer,
    blobPath: file.cleanBlobPath,
    startsAtUtc: new Date(now.getTime() - 60000).toISOString(),
    expiresAtUtc
  });

  if (dependencies.logger?.log) {
    await dependencies.logger.log('hr_clean_document_access_issued', {
      applicationReference,
      fileReference,
      principalObjectId: authorization.principal.objectId,
      expiresAtUtc,
      verifiedSha256: verified.sha256
    });
  }

  return response(200, null, {
    applicationReference,
    fileReference,
    downloadName: file.originalFileName,
    contentType: file.declaredMimeType,
    sizeBytes: file.sizeBytes,
    url: access.url,
    expiresAtUtc: access.expiresAtUtc
  });
}

module.exports = {
  REFERENCE_PATTERN,
  validReference,
  accessCleanDocument
};
