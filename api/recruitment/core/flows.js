'use strict';

const crypto = require('crypto');
const {
  APPLICATION_STATES: A,
  FILE_STATES: F,
  HIRING_STAGES: H,
  NOTIFICATION_EVENTS: N,
  SCAN_RESULTS: S,
  CONTAINERS,
  ERROR_CODES
} = require('./constants');
const { transition } = require('./stateMachines');
const { role: validateRole, candidate: validateCandidate, request: validateRequest, fileMeta } = require('./validation');
const { detect } = require('./fileTypes');

const TOKEN_VERSION = 1;
const TOKEN_ISSUER = 'shorevest.recruitment.phase2a';
const TOKEN_AUDIENCE = 'shorevest.recruitment.upload-completion';
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function fail(errorCode, extra = {}) {
  return { success: false, errorCode, ...extra };
}

async function safeLog(deps, event, fields) {
  try { if (deps.logger?.log) await deps.logger.log(event, fields); } catch (_) {}
}

async function safeCall(fn) { try { return await fn(); } catch (_) { return undefined; } }

function cleanPath(year, roleId, applicationReference, fileReference, extension) {
  return `recruitment/${year}/${roleId}/${applicationReference}/${fileReference}.${extension}`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}


function completionTokenPayload({ now, applicationReference, fileReference, blobPath, sizeBytes, contentType, tokenId, credentialGeneration }) {
  return {
    version: TOKEN_VERSION,
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    issuedAtUtc: now.toISOString(),
    expiresAtUtc: addMinutes(now, 10),
    tokenId,
    credentialGeneration,
    applicationReference,
    fileReference,
    quarantineBlobPath: blobPath,
    expectedSizeBytes: sizeBytes,
    expectedDeclaredMimeType: contentType
  };
}

function validDateString(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateTokenPayload(payload, request, file, now) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const issued = validDateString(payload.issuedAtUtc);
  const expires = validDateString(payload.expiresAtUtc);
  if (payload.version !== TOKEN_VERSION || payload.issuer !== TOKEN_ISSUER || payload.audience !== TOKEN_AUDIENCE) return false;
  if (typeof payload.tokenId !== 'string' || !payload.tokenId.trim()) return false;
  if (!issued || !expires || expires <= issued || expires - issued > 10 * 60 * 1000) return false;
  if (expires < now.getTime() - CLOCK_SKEW_MS || issued > now.getTime() + CLOCK_SKEW_MS) return false;
  if (payload.applicationReference !== request.applicationReference || payload.fileReference !== request.fileReference) return false;
  if (payload.quarantineBlobPath !== file.quarantineBlobPath) return false;
  if (payload.credentialGeneration !== file.credentialGeneration) return false;
  if (payload.expectedSizeBytes !== file.sizeBytes || payload.expectedDeclaredMimeType !== file.declaredMimeType) return false;
  return true;
}


function canonicalFingerprintInput({ request, roleId, candidate }) {
  return JSON.stringify({
    roleId,
    locale: request.locale,
    source: request.source,
    candidate: {
      fullName: candidate.fullName,
      email: candidate.email,
      telephone: candidate.telephone,
      currentLocation: candidate.currentLocation,
      linkedinUrl: candidate.linkedinUrl,
      coverNote: candidate.coverNote
    },
    privacyNoticeVersion: request.privacyNoticeVersion,
    file: {
      originalName: request.file.originalName.trim(),
      sizeBytes: request.file.sizeBytes,
      declaredMimeType: request.file.declaredMimeType
    }
  });
}

async function requestFingerprint(deps, data) {
  const canonical = canonicalFingerprintInput(data);
  if (!deps.fingerprints || typeof deps.fingerprints.hmac !== 'function') {
    const error = new Error('fingerprint adapter is not configured');
    error.code = ERROR_CODES.INTERNAL_CONFIGURATION_ERROR;
    throw error;
  }
  return deps.fingerprints.hmac(canonical);
}

function stableAlreadySubmitted(application, file, reservation) {
  return { success: true, alreadySubmitted: true, applicationReference: application.applicationReference, fileReference: file.fileReference, applicationStatus: application.technicalStatus, fileStatus: file.technicalStatus, retryAfterMs: 0 };
}

function validateCompleteRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return false;
  const keys = Object.keys(request);
  if (keys.length !== 3 || !keys.every((key) => ['applicationReference', 'fileReference', 'completionToken'].includes(key))) return false;
  return ['applicationReference', 'fileReference', 'completionToken'].every((key) => typeof request[key] === 'string' && request[key].trim().length > 0 && request[key].length <= 4096);
}


async function initiateApplication(request, deps) {
  let idempotencyKey = request?.roleId && request?.clientSubmissionId ? `init:${request.roleId}:${request.clientSubmissionId}` : null;
  try {
    const now = await deps.now();
    const requestValidation = validateRequest(request, now);
    if (!requestValidation.ok) return requestValidation;
    idempotencyKey = `init:${request.roleId}:${request.clientSubmissionId}`;

    const rateLimit = deps.rateLimiter ? await deps.rateLimiter.check(`${request.roleId}:${request.clientSubmissionId}`) : { allowed: true };
    if (rateLimit.allowed !== true) return fail(ERROR_CODES.RATE_LIMITED);
    const botVerification = deps.botVerifier ? await deps.botVerifier.verify(request) : { ok: true };
    if (botVerification.ok !== true) return fail(ERROR_CODES.BOT_VERIFICATION_FAILED);
    const manifest = await deps.loadManifest();
    const roleResult = validateRole(manifest, request.roleId, request.locale, request.privacyNoticeVersion, now);
    if (!roleResult.ok) return fail(roleResult.errorCode);
    if (!roleResult.role.application.allowedSources.includes(request.source)) return fail(ERROR_CODES.VALIDATION_FAILED);
    const candidateResult = validateCandidate(request.candidate, request.privacyAccepted);
    if (!candidateResult.ok) return candidateResult;
    const fileResult = fileMeta(request.file, roleResult.role.application.cv);
    if (!fileResult.ok) return fileResult;
    const fingerprint = await requestFingerprint(deps, { request, roleId: roleResult.role.id, candidate: candidateResult.candidate });

    const leaseOwner = deps.leaseOwner || `lease-${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex')}`;
    const claim = await deps.idempotency.claim(idempotencyKey, leaseOwner, addMinutes(now, 10), fingerprint);
    if (claim.status === 'conflict') return fail(ERROR_CODES.IDEMPOTENCY_CONFLICT);
    if (claim.status === 'in_progress') {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (deps.delay) await deps.delay(10);
        const current = await deps.idempotency.get(idempotencyKey);
        if (current?.state === 'CredentialsIssued' && current.requestFingerprint === fingerprint && current.result) return current.result;
      }
      return fail(ERROR_CODES.SUBMISSION_IN_PROGRESS, { retryAfterMs: claim.retryAfterMs || 1000 });
    }

    let reservation = claim.reservation || claim.record?.reservation || await deps.applicationStore.getReservation?.(idempotencyKey);
    if (reservation && reservation.requestFingerprint !== fingerprint) return fail(ERROR_CODES.IDEMPOTENCY_CONFLICT);
    if (!reservation) {
      const applicationReference = await deps.references.application();
      const fileReference = await deps.references.file();
      reservation = { idempotencyKey, roleId: roleResult.role.id, clientSubmissionId: request.clientSubmissionId,
        applicationReference, fileReference,
        quarantineBlobPath: cleanPath(now.getUTCFullYear(), roleResult.role.id, applicationReference, fileReference, fileResult.extension),
        expectedExtension: fileResult.extension, expectedSizeBytes: request.file.sizeBytes, expectedMimeType: request.file.declaredMimeType,
        originalFileName: request.file.originalName.trim(), privacyNoticeVersion: request.privacyNoticeVersion, requestFingerprint: fingerprint,
        reservationState: 'Reserved', credentialGeneration: 0, createdAtUtc: now.toISOString(), updatedAtUtc: now.toISOString() };
      reservation = await reservation;
      await deps.idempotency.recordReservation(idempotencyKey, reservation);
    }

    const timestamp = now.toISOString();
    const application = { applicationReference: reservation.applicationReference, roleId: roleResult.role.id,
      roleTitle: roleResult.role.title[request.locale], roleDepartment: roleResult.role.department[request.locale], roleLocation: roleResult.role.location[request.locale],
      locale: request.locale, source: request.source, candidateName: candidateResult.candidate.fullName, candidateEmail: candidateResult.candidate.email,
      candidateTelephone: candidateResult.candidate.telephone, candidateLocation: candidateResult.candidate.currentLocation,
      linkedInUrl: candidateResult.candidate.linkedinUrl, coverNote: candidateResult.candidate.coverNote,
      privacyNoticeVersion: request.privacyNoticeVersion, requestFingerprint: fingerprint, privacyAcceptedAtUtc: timestamp, submittedAtClientUtc: request.submittedAtClientUtc || null,
      submittedAtServerUtc: timestamp, technicalStatus: A.UploadPending, hiringStage: H.New, fileCount: 1, readyFileCount: 0,
      requiresManualReview: false, retentionReviewDate: addMinutes(now, 60 * 24 * 365), lastUpdatedAtUtc: timestamp };
    const file = { fileReference: reservation.fileReference, applicationReference: reservation.applicationReference, filePurpose: 'CV', originalFileName: reservation.originalFileName,
      declaredMimeType: reservation.expectedMimeType, detectedFileType: null, sizeBytes: reservation.expectedSizeBytes, expectedHash: null,
      quarantineBlobPath: reservation.quarantineBlobPath, cleanBlobPath: null, quarantineRemovalPending: false, technicalStatus: F.SASIssued, scanResult: null, requestFingerprint: fingerprint, credentialGeneration: reservation.credentialGeneration || 0, lastUpdatedAtUtc: timestamp };
    await deps.applicationStore.createInitialRecords({ application, file, idempotencyKey, reservation });

    const currentApp = await deps.applicationStore.getApplication(reservation.applicationReference);
    const currentFile = await deps.applicationStore.getFile(reservation.applicationReference, reservation.fileReference);
    if (currentFile.technicalStatus !== F.SASIssued || currentApp.technicalStatus !== A.UploadPending) return stableAlreadySubmitted(currentApp, currentFile, reservation);
    const safeUntil = Date.parse(reservation.lastCredentialExpiryUtc || currentFile.credentialExpiresAtUtc || 0) - 60 * 1000;
    if (claim.record?.result && safeUntil > now.getTime()) return claim.record.result;

    const lease = await deps.idempotency.beginCredentialIssuance(idempotencyKey, leaseOwner, addMinutes(now, 2));
    if (lease.status === 'in_progress') {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (deps.delay) await deps.delay(10);
        const current = await deps.idempotency.get(idempotencyKey);
        if (current?.state === 'CredentialsIssued' && current.requestFingerprint === fingerprint && current.result) return current.result;
      }
      return fail(ERROR_CODES.SUBMISSION_IN_PROGRESS, { retryAfterMs: lease.retryAfterMs || 1000 });
    }
    const generation = lease.generation || ((reservation.credentialGeneration || 0) + 1);
    try {
      const expiresAtUtc = addMinutes(now, 10);
      const upload = await deps.sas.issue({ container: CONTAINERS.quarantine, blobPath: reservation.quarantineBlobPath, permissions: ['create','write'], httpsOnly: true, userDelegation: true, expiresAtUtc, startsAtUtc: addMinutes(now, -5), contentType: reservation.expectedMimeType });
      const completionToken = await deps.tokens.sign(completionTokenPayload({ now, applicationReference: reservation.applicationReference, fileReference: reservation.fileReference, blobPath: reservation.quarantineBlobPath, sizeBytes: reservation.expectedSizeBytes, contentType: reservation.expectedMimeType, tokenId: await deps.references.tokenId(), credentialGeneration: generation }));
      const result = { success: true, applicationReference: reservation.applicationReference, fileReference: reservation.fileReference, upload, completionToken, credentialGeneration: generation };
      const stable = { applicationReference: reservation.applicationReference, fileReference: reservation.fileReference, quarantineBlobPath: reservation.quarantineBlobPath, applicationStatus: currentApp.technicalStatus, fileStatus: currentFile.technicalStatus, credentialGeneration: generation, lastCredentialExpiryUtc: expiresAtUtc };
      currentFile.credentialGeneration = generation; currentFile.credentialExpiresAtUtc = expiresAtUtc; currentFile.lastUpdatedAtUtc = timestamp;
      await deps.applicationStore.commitAggregate({ expectedVersion: currentApp.aggregateVersion || 0, application: currentApp, files: [currentFile], outboxEvents: [] });
      await deps.idempotency.credentialsIssued(idempotencyKey, result, stable);
      await safeLog(deps, 'initiate_application', { applicationReference: reservation.applicationReference, roleId: roleResult.role.id, credentialGeneration: generation });
      return result;
    } catch (e) { await safeCall(() => deps.idempotency.credentialRetryableFailure(idempotencyKey, ERROR_CODES.SUBMISSION_FAILED)); throw e; }
  } catch (error) {
    if (error.code === ERROR_CODES.RESERVATION_INTEGRITY_CONFLICT) { await safeLog(deps, 'reservation_integrity_conflict', { idempotencyKey }); return fail(ERROR_CODES.RESERVATION_INTEGRITY_CONFLICT); }
    if (idempotencyKey) await safeCall(() => deps.idempotency.retryableFailure(idempotencyKey, ERROR_CODES.SUBMISSION_FAILED));
    await safeLog(deps, 'initiate_application_failed', { roleId: request?.roleId, errorCode: ERROR_CODES.SUBMISSION_FAILED });
    return fail(ERROR_CODES.SUBMISSION_FAILED);
  }
}

async function completeUpload(request, deps) {
  if (!validateCompleteRequest(request)) return fail(ERROR_CODES.VALIDATION_FAILED);
  const claimKey = `complete:${request.applicationReference}:${request.fileReference}`;
  try {
    const now = await deps.now();
    let tokenPayload;
    try { tokenPayload = await deps.tokens.verify(request.completionToken); } catch (_) { return fail(ERROR_CODES.TOKEN_INVALID); }
    if (tokenPayload.applicationReference !== request.applicationReference || tokenPayload.fileReference !== request.fileReference) return fail(ERROR_CODES.TOKEN_INVALID);
    const application = await deps.applicationStore.getApplication(request.applicationReference);
    const file = await deps.applicationStore.getFile(request.applicationReference, request.fileReference);
    if (!application || !file || file.applicationReference !== application.applicationReference) return fail(ERROR_CODES.VALIDATION_FAILED);
    if (!validateTokenPayload(tokenPayload, request, file, now)) return fail(ERROR_CODES.TOKEN_INVALID);
    const completionClaim = { applicationReference: request.applicationReference, fileReference: request.fileReference, claimKey, leaseOwner: deps.leaseOwner || 'completion-worker', leaseExpiresAtUtc: addMinutes(now, 5) };
    const claim = await deps.completionClaims.claim(completionClaim);
    if (claim.status === 'completed') return claim.result;
    if (claim.status === 'permanent_failure') return claim.result || fail(ERROR_CODES.TOKEN_INVALID);
    if (claim.status === 'in_progress') return fail(ERROR_CODES.SUBMISSION_IN_PROGRESS, { retryAfterMs: claim.retryAfterMs || 1000 });
    if (file.technicalStatus === F.ScanPending && application.technicalStatus === A.Scanning) {
      const result = { success: true, applicationReference: application.applicationReference, fileReference: file.fileReference, status: application.technicalStatus };
      await deps.completionClaims.complete(completionClaim, result); return result;
    }
    const properties = await deps.storage.properties(CONTAINERS.quarantine, file.quarantineBlobPath);
    if (!properties) { await deps.completionClaims.retryableFailure(completionClaim, ERROR_CODES.BLOB_NOT_FOUND); return fail(ERROR_CODES.BLOB_NOT_FOUND); }
    if (properties.sizeBytes !== file.sizeBytes || properties.contentType !== file.declaredMimeType) { await deps.completionClaims.permanentFailure(completionClaim, ERROR_CODES.BLOB_MISMATCH); return fail(ERROR_CODES.BLOB_MISMATCH); }
    const bytes = await deps.storage.read(CONTAINERS.quarantine, file.quarantineBlobPath, { maxBytes: file.sizeBytes });
    deps.counters && (deps.counters.verifications += 1);
    const detectedType = detect(bytes);
    const expectedDocx = file.declaredMimeType.includes('wordprocessingml');
    if ((file.declaredMimeType === 'application/pdf' && detectedType !== 'pdf') || (expectedDocx && detectedType !== 'docx')) {
      const failedFile = { ...file, technicalStatus: transition('file', file.technicalStatus, F.ValidationFailed), lastUpdatedAtUtc: now.toISOString() };
      await deps.applicationStore.commitAggregate({ expectedVersion: application.aggregateVersion || 0, application, files: [failedFile], outboxEvents: [] });
      await deps.completionClaims.permanentFailure(completionClaim, ERROR_CODES.FILE_SIGNATURE_REJECTED);
      return fail(ERROR_CODES.FILE_SIGNATURE_REJECTED);
    }
    const nextFile = { ...file, detectedFileType: detectedType, expectedHash: hashBuffer(bytes), technicalStatus: transition('file', transition('file', file.technicalStatus, F.Uploaded), F.ScanPending), uploadVerifiedAtUtc: now.toISOString(), scanStartedAtUtc: now.toISOString(), lastUpdatedAtUtc: now.toISOString() };
    const nextApp = { ...application, technicalStatus: transition('application', transition('application', application.technicalStatus, A.Received), A.Scanning), lastUpdatedAtUtc: now.toISOString() };
    await deps.applicationStore.commitAggregate({ expectedVersion: application.aggregateVersion || 0, application: nextApp, files: [nextFile], outboxEvents: [{ type: N.ApplicationReceived, idempotencyKey: `outbox:${application.applicationReference}:received`, applicationReference: application.applicationReference }] });
    const result = { success: true, applicationReference: application.applicationReference, fileReference: file.fileReference, status: A.Scanning };
    await deps.completionClaims.complete(completionClaim, result);
    return result;
  } catch (error) {
    await safeCall(() => deps.completionClaims.retryableFailure({ applicationReference: request.applicationReference, fileReference: request.fileReference, claimKey }, ERROR_CODES.INFRASTRUCTURE_RETRYABLE));
    await safeLog(deps, 'complete_upload_failed', { applicationReference: request.applicationReference, fileReference: request.fileReference, errorCode: ERROR_CODES.INFRASTRUCTURE_RETRYABLE });
    return fail(ERROR_CODES.INFRASTRUCTURE_RETRYABLE);
  }
}

function validateScanEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (typeof event.eventId !== 'string' || !event.eventId) return false;
  if (typeof event.fileReference !== 'string' || !event.fileReference) return false;
  if (typeof event.blobPath !== 'string' || !event.blobPath) return false;
  if (!Object.values(S).includes(event.result)) return false;
  if (typeof event.scannedAtUtc !== 'string' || Number.isNaN(Date.parse(event.scannedAtUtc))) return false;
  return true;
}


async function hasOutbox(deps, applicationReference, idempotencyKey, type) {
  if (!deps.applicationStore || typeof deps.applicationStore.hasOutboxEvent !== 'function') {
    const error = new Error('outbox lookup adapter is not configured');
    error.code = ERROR_CODES.INTERNAL_CONFIGURATION_ERROR;
    throw error;
  }
  return deps.applicationStore.hasOutboxEvent({ applicationReference, idempotencyKey, type });
}

async function reconcileAppliedScanOutcome(event, deps, application, file, eventKey) {
  if (!application || !file || file.scanEventId !== event.eventId || file.quarantineBlobPath !== event.blobPath || file.scanResult !== event.result) return false;
  let ok = false;
  if (event.result === S.Clean) ok = file.technicalStatus === F.Ready && application.technicalStatus === A.Ready && file.cleanBlobPath === file.quarantineBlobPath && await hasOutbox(deps, application.applicationReference, `outbox:${application.applicationReference}:documents-ready`, N.DocumentsReady);
  else if (event.result === S.Malicious) ok = file.technicalStatus === F.Malicious && application.technicalStatus === A.Blocked && await hasOutbox(deps, application.applicationReference, `outbox:${application.applicationReference}:${file.fileReference}:malicious`, N.MaliciousFileDetected);
  else ok = file.technicalStatus === F.ManualReview && application.technicalStatus === A.ManualReview && await hasOutbox(deps, application.applicationReference, `outbox:${application.applicationReference}:${file.fileReference}:manual-review`, N.ManualReviewRequired);
  if (!ok) return false;
  await deps.scanEvents.complete(eventKey, { success: true, reconciled: true });
  return true;
}

async function processScanResult(event, deps, policy = { deleteMaliciousQuarantine: false }) {
  if (!event?.applicationReference && deps.applicationStore?.getReservationByFile && event?.fileReference) {
    const reservation = await deps.applicationStore.getReservationByFile(event.fileReference);
    if (reservation?.applicationReference) event = { ...event, applicationReference: reservation.applicationReference };
  }
  if (!validateScanEvent(event)) return fail(ERROR_CODES.VALIDATION_FAILED);
  if (typeof event.applicationReference !== 'string' || !event.applicationReference) return fail(ERROR_CODES.VALIDATION_FAILED);
  const eventKey = `${event.eventId}:${event.fileReference}`;
  const scanClaim = { applicationReference: event.applicationReference, fileReference: event.fileReference, eventId: event.eventId, eventKey, leaseOwner: deps.leaseOwner || 'scan-worker', leaseExpiresAtUtc: null };
  try {
    const now = await deps.now();
    scanClaim.leaseExpiresAtUtc = addMinutes(now, 5);
    const claim = await deps.scanEvents.claim(scanClaim);
    if (claim.status === 'completed') return { success: true, deduplicated: true };
    if (claim.status === 'in_progress') return fail(ERROR_CODES.EVENT_IN_PROGRESS);
    if (claim.status === 'permanent_failure') return fail(ERROR_CODES.STATE_TRANSITION_INVALID);
    const file = await deps.applicationStore.getFile(event.applicationReference, event.fileReference);
    if (!file || file.quarantineBlobPath !== event.blobPath) { await safeCall(() => deps.scanEvents.permanentFailure(scanClaim, ERROR_CODES.BLOB_MISMATCH)); return fail(ERROR_CODES.BLOB_MISMATCH); }
    const application = await deps.applicationStore.getApplication(file.applicationReference);
    if (!application || application.applicationReference !== file.applicationReference) { await safeCall(() => deps.scanEvents.permanentFailure(scanClaim, ERROR_CODES.STATE_TRANSITION_INVALID)); return fail(ERROR_CODES.STATE_TRANSITION_INVALID); }
    if (file.technicalStatus !== F.ScanPending) {
      if (await reconcileAppliedScanOutcome(event, deps, application, file, eventKey)) return { success: true, reconciled: true };
      await safeCall(() => deps.scanEvents.permanentFailure(scanClaim, ERROR_CODES.STATE_TRANSITION_INVALID)); return fail(ERROR_CODES.STATE_TRANSITION_INVALID);
    }
    let nextFile = { ...file, scanEventId: event.eventId, scanResult: event.result, scanCompletedAtUtc: event.scannedAtUtc, lastUpdatedAtUtc: event.scannedAtUtc };
    let nextApp = { ...application, lastUpdatedAtUtc: event.scannedAtUtc };
    let outboxEvent;
    if (event.result === S.Clean) {
      const cleanBlobPath = file.quarantineBlobPath;
      const promoted = await deps.storage.promoteClean({ sourceContainer: CONTAINERS.quarantine, sourcePath: file.quarantineBlobPath, destinationContainer: CONTAINERS.clean, destinationPath: cleanBlobPath, expectedSizeBytes: file.sizeBytes, expectedContentType: file.declaredMimeType, expectedHash: file.expectedHash });
      if (promoted.status !== 'Succeeded') throw new Error('clean promotion incomplete');
      nextFile = { ...nextFile, technicalStatus: transition('file', transition('file', file.technicalStatus, F.Clean), F.Ready), cleanBlobPath, readyAtUtc: event.scannedAtUtc, quarantineRemovalPending: true };
      nextApp = { ...nextApp, technicalStatus: transition('application', application.technicalStatus, A.Ready), readyFileCount: 1, readyAtUtc: event.scannedAtUtc };
      outboxEvent = { type: N.DocumentsReady, idempotencyKey: `outbox:${application.applicationReference}:documents-ready`, applicationReference: application.applicationReference };
      await deps.applicationStore.commitAggregate({ expectedVersion: application.aggregateVersion || 0, application: nextApp, files: [nextFile], outboxEvents: [outboxEvent] });
      const result = { success: true };
      await deps.scanEvents.complete(scanClaim, result);
      try {
        await deps.storage.delete(CONTAINERS.quarantine, file.quarantineBlobPath);
        const freshApp = await deps.applicationStore.getApplication(application.applicationReference);
        const freshFile = await deps.applicationStore.getFile(application.applicationReference, file.fileReference);
        await deps.applicationStore.commitAggregate({ expectedVersion: freshApp.aggregateVersion || 0, application: freshApp, files: [{ ...freshFile, quarantineRemovalPending: false, quarantineRemovedAtUtc: event.scannedAtUtc, lastUpdatedAtUtc: event.scannedAtUtc }], outboxEvents: [] });
      } catch (_) {
        const freshApp = await deps.applicationStore.getApplication(application.applicationReference);
        const freshFile = await deps.applicationStore.getFile(application.applicationReference, file.fileReference);
        await safeCall(() => deps.applicationStore.commitAggregate({ expectedVersion: freshApp.aggregateVersion || 0, application: freshApp, files: [{ ...freshFile, quarantineRemovalPending: true }], outboxEvents: [{ type: N.QuarantineCleanupRequired, idempotencyKey: `outbox:${application.applicationReference}:${file.fileReference}:quarantine-cleanup`, applicationReference: application.applicationReference, fileReference: file.fileReference }] }));
      }
      return result;
    }
    if (event.result === S.Malicious) {
      nextFile = { ...nextFile, technicalStatus: transition('file', file.technicalStatus, F.Malicious), quarantineRetentionPolicyAppliedAtUtc: event.scannedAtUtc };
      nextApp = { ...nextApp, technicalStatus: transition('application', application.technicalStatus, A.Blocked), blockedAtUtc: event.scannedAtUtc };
      outboxEvent = { type: N.MaliciousFileDetected, idempotencyKey: `outbox:${application.applicationReference}:${file.fileReference}:malicious`, applicationReference: application.applicationReference, fileReference: file.fileReference };
      await deps.applicationStore.commitAggregate({ expectedVersion: application.aggregateVersion || 0, application: nextApp, files: [nextFile], outboxEvents: [outboxEvent] });
      const result = { success: true };
      await deps.scanEvents.complete(scanClaim, result);
      if (policy.deleteMaliciousQuarantine) await safeCall(() => deps.storage.delete(CONTAINERS.quarantine, file.quarantineBlobPath));
      return result;
    }
    nextFile = { ...nextFile, technicalStatus: transition('file', transition('file', file.technicalStatus, F.ScanFailed), F.ManualReview) };
    nextApp = { ...nextApp, technicalStatus: transition('application', application.technicalStatus, A.ManualReview), requiresManualReview: true, manualReviewAtUtc: event.scannedAtUtc };
    outboxEvent = { type: N.ManualReviewRequired, idempotencyKey: `outbox:${application.applicationReference}:${file.fileReference}:manual-review`, applicationReference: application.applicationReference, fileReference: file.fileReference };
    await deps.applicationStore.commitAggregate({ expectedVersion: application.aggregateVersion || 0, application: nextApp, files: [nextFile], outboxEvents: [outboxEvent] });
    const result = { success: true }; await deps.scanEvents.complete(scanClaim, result); return result;
  } catch (error) {
    await safeCall(() => deps.scanEvents.retryableFailure(scanClaim, ERROR_CODES.INFRASTRUCTURE_RETRYABLE));
    await safeLog(deps, 'process_scan_result_failed', { eventId: event?.eventId, fileReference: event?.fileReference, errorCode: ERROR_CODES.INFRASTRUCTURE_RETRYABLE });
    return fail(ERROR_CODES.INFRASTRUCTURE_RETRYABLE);
  }
}

async function retryQuarantineCleanup({ applicationReference, fileReference } = {}, deps) {
  try {
    if (typeof applicationReference !== 'string' || !applicationReference || typeof fileReference !== 'string' || !fileReference) return fail(ERROR_CODES.VALIDATION_FAILED);
    const file = await deps.applicationStore.getFile(arguments[0]?.applicationReference, fileReference);
    if (!file || !file.quarantineRemovalPending) return fail(ERROR_CODES.VALIDATION_FAILED);
    await deps.storage.delete(CONTAINERS.quarantine, file.quarantineBlobPath);
    const application = await deps.applicationStore.getApplication(file.applicationReference);
    const updated = { ...file, quarantineRemovalPending: false, quarantineRemovedAtUtc: (await deps.now()).toISOString() };
    updated.lastUpdatedAtUtc = updated.quarantineRemovedAtUtc;
    await deps.applicationStore.commitAggregate({ expectedVersion: application.aggregateVersion || 0, application, files: [updated], outboxEvents: [] });
    return { success: true };
  } catch (error) {
    await safeLog(deps, 'retry_quarantine_cleanup_failed', { fileReference, errorCode: ERROR_CODES.INFRASTRUCTURE_RETRYABLE });
    return fail(ERROR_CODES.INFRASTRUCTURE_RETRYABLE);
  }
}

module.exports = { initiateApplication, completeUpload, processScanResult, retryQuarantineCleanup, cleanPath };
