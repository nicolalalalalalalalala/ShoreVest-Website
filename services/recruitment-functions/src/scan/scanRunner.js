'use strict';

// Bridges a quarantined-CV blob event to the recruitment core scan pipeline
// using a self-hosted ClamAV scan instead of Microsoft Defender.
//
//   BlobCreated (quarantine) --> download bytes --> clamd scan
//       --> synthesize a normalized scan event --> flows.processScanResult(...)
//
// processScanResult owns everything downstream (promote-to-clean, malicious
// blocking, manual-review routing, quarantine cleanup, notifications, dedup),
// exactly as it did for Defender. This module only produces the scan verdict.

const { processScanResult: coreProcessScanResult } = require('../../../../api/recruitment/core/flows');
const { SCAN_RESULTS, FILE_STATES, CONTAINERS, ERROR_CODES } = require('../../../../api/recruitment/core/constants');

const DEFAULT_MAX_SCAN_BYTES = 30 * 1024 * 1024; // clamd StreamMaxLength is 25MB by default; keep a small margin above CV limits.

// Signals the queue worker to leave the message for redelivery (transient state).
class RetryableScanError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = 'RetryableScanError';
    this.retryable = true;
    this.reason = reason;
  }
}

// States that mean the scan verdict has already been applied for this file, so a
// (re)delivered BlobCreated event is a no-op we can safely acknowledge.
const TERMINAL_FILE_STATES = new Set([
  FILE_STATES.Clean, FILE_STATES.Ready, FILE_STATES.Malicious,
  FILE_STATES.ScanFailed, FILE_STATES.ManualReview, FILE_STATES.Removed, FILE_STATES.ValidationFailed
]);

async function safeLog(deps, event, fields) {
  try { if (deps.logger?.log) await deps.logger.log(event, fields); } catch (_) {}
}

async function scanQuarantineBlob(blobInput, deps, scanner, options = {}) {
  const processScanResult = options.processScanResult || coreProcessScanResult;
  const maxScanBytes = options.maxScanBytes || DEFAULT_MAX_SCAN_BYTES;
  const { applicationReference, fileReference, blobPath, roleId, eventId } = blobInput;

  if (!eventId || !fileReference || !blobPath || !applicationReference) {
    return { outcome: 'skipped', reason: 'incomplete-blob-event' };
  }

  const file = await deps.applicationStore.getFile(applicationReference, fileReference);
  if (!file) {
    // The completeUpload step may not have written the file record yet, or this
    // is a stray blob. Retry a bounded number of times (queue dequeueCount caps it).
    throw new RetryableScanError('file record not yet available', 'file-not-found');
  }
  if (file.quarantineBlobPath !== blobPath) {
    return { outcome: 'skipped', reason: 'blob-path-mismatch' };
  }
  if (file.technicalStatus !== FILE_STATES.ScanPending) {
    if (TERMINAL_FILE_STATES.has(file.technicalStatus)) {
      return { outcome: 'skipped', reason: `already-${file.technicalStatus}` };
    }
    // SASIssued / Uploaded: the client has not called complete yet, which is what
    // moves the file into ScanPending. Wait and retry rather than fail the scan.
    throw new RetryableScanError(`file not scan-ready (${file.technicalStatus})`, 'awaiting-scan-pending');
  }

  const boundBytes = Math.min(maxScanBytes, file.sizeBytes || maxScanBytes);
  let bytes;
  try {
    bytes = await deps.storage.read(CONTAINERS.quarantine, blobPath, { maxBytes: boundBytes });
  } catch (error) {
    throw new RetryableScanError(`quarantine read failed: ${error.code || error.message}`, 'blob-read-failed');
  }

  let result;
  let signature = null;
  try {
    const verdict = await scanner.scan(bytes);
    result = verdict.result;
    signature = verdict.signature || null;
  } catch (error) {
    if (error.code === 'CLAMD_SCAN_ERROR') {
      // The engine ran but could not produce a verdict (e.g. size/type limit).
      // Never treat as clean: route to manual review via ScanFailed.
      result = SCAN_RESULTS.ScanFailed;
    } else {
      // Connect/timeout/transport failure: retry later, do not consume the event.
      throw new RetryableScanError(`clamd unavailable: ${error.code || error.message}`, 'clamd-unavailable');
    }
  }

  const now = await deps.now();
  const scanEvent = {
    eventId: `clamav:${eventId}`,
    correlationId: null,
    roleId,
    applicationReference,
    fileReference,
    blobPath,
    blobETag: file.expectedETag || null,
    sha256: null,
    result,
    scannedAtUtc: now.toISOString()
  };

  const processed = await processScanResult(scanEvent, deps);
  if (processed && processed.success) {
    await safeLog(deps, 'clamav_scan_applied', { applicationReference, fileReference, roleId, classification: result });
    return { outcome: 'ack', result, signature };
  }

  const code = processed && processed.errorCode;
  if (code === ERROR_CODES.INFRASTRUCTURE_RETRYABLE || code === ERROR_CODES.EVENT_IN_PROGRESS) {
    throw new RetryableScanError(`scan processing retryable: ${code}`, 'processing-retryable');
  }
  // Terminal, non-retryable core outcome (e.g. state already transitioned by a
  // concurrent delivery, or a validation rejection): acknowledge and move on.
  await safeLog(deps, 'clamav_scan_not_applied', { applicationReference, fileReference, errorCode: code || 'UNKNOWN' });
  return { outcome: 'ack', result, signature, errorCode: code || 'UNKNOWN' };
}

module.exports = { scanQuarantineBlob, RetryableScanError, DEFAULT_MAX_SCAN_BYTES };
