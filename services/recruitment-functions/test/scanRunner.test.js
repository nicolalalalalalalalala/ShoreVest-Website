'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { scanQuarantineBlob, RetryableScanError } = require('../src/scan/scanRunner');
const { SCAN_RESULTS, FILE_STATES } = require('../../../api/recruitment/core/constants');

const appRef = 'SV-APP-2026-0123456789ABCDEF';
const fileRef = 'SV-FILE-FEDCBA9876543210';
const blobPath = `recruitment/2026/legal-assistant/${appRef}/${fileRef}.docx`;

function blobInput(overrides = {}) {
  return { eventId: 'evt-1', roleId: 'legal-assistant', applicationReference: appRef, fileReference: fileRef, blobPath, ...overrides };
}

function makeDeps({ file, readBytes = Buffer.from('cv bytes'), captured } = {}) {
  return {
    applicationStore: { async getFile() { return file; } },
    storage: { async read() { return readBytes; } },
    now: async () => new Date('2026-09-06T12:00:00Z'),
    logger: { async log() {} },
    __captured: captured
  };
}

function fileIn(status) {
  return { applicationReference: appRef, fileReference: fileRef, quarantineBlobPath: blobPath, technicalStatus: status, sizeBytes: 8 };
}

function capturingProcess(store) {
  return async (event) => { store.event = event; return { success: true }; };
}

test('clean file is scanned and applied as Clean', async () => {
  const store = {};
  const deps = makeDeps({ file: fileIn(FILE_STATES.ScanPending) });
  const scanner = { async scan() { return { verdict: 'clean', result: SCAN_RESULTS.Clean }; } };
  const res = await scanQuarantineBlob(blobInput(), deps, scanner, { processScanResult: capturingProcess(store) });
  assert.equal(res.outcome, 'ack');
  assert.equal(res.result, SCAN_RESULTS.Clean);
  assert.equal(store.event.result, SCAN_RESULTS.Clean);
  assert.equal(store.event.eventId, 'clamav:evt-1');
  assert.equal(store.event.applicationReference, appRef);
  assert.equal(store.event.blobPath, blobPath);
  assert.equal(store.event.scannedAtUtc, '2026-09-06T12:00:00.000Z');
});

test('infected file maps to Malicious', async () => {
  const store = {};
  const deps = makeDeps({ file: fileIn(FILE_STATES.ScanPending) });
  const scanner = { async scan() { return { verdict: 'infected', signature: 'Eicar', result: SCAN_RESULTS.Malicious }; } };
  const res = await scanQuarantineBlob(blobInput(), deps, scanner, { processScanResult: capturingProcess(store) });
  assert.equal(res.result, SCAN_RESULTS.Malicious);
  assert.equal(res.signature, 'Eicar');
  assert.equal(store.event.result, SCAN_RESULTS.Malicious);
});

test('clamd scan error routes to ScanFailed (manual review), still acked', async () => {
  const store = {};
  const deps = makeDeps({ file: fileIn(FILE_STATES.ScanPending) });
  const scanner = { async scan() { const e = new Error('limit'); e.code = 'CLAMD_SCAN_ERROR'; throw e; } };
  const res = await scanQuarantineBlob(blobInput(), deps, scanner, { processScanResult: capturingProcess(store) });
  assert.equal(res.outcome, 'ack');
  assert.equal(store.event.result, SCAN_RESULTS.ScanFailed);
});

test('clamd unavailable is retryable (message left on queue)', async () => {
  const deps = makeDeps({ file: fileIn(FILE_STATES.ScanPending) });
  const scanner = { async scan() { const e = new Error('down'); e.code = 'CLAMD_CONNECT_FAILED'; throw e; } };
  await assert.rejects(() => scanQuarantineBlob(blobInput(), deps, scanner, { processScanResult: async () => ({ success: true }) }),
    (err) => err instanceof RetryableScanError && err.reason === 'clamd-unavailable');
});

test('missing file record is retryable', async () => {
  const deps = makeDeps({ file: null });
  const scanner = { async scan() { return { result: SCAN_RESULTS.Clean }; } };
  await assert.rejects(() => scanQuarantineBlob(blobInput(), deps, scanner, {}),
    (err) => err instanceof RetryableScanError && err.reason === 'file-not-found');
});

test('file not yet ScanPending is retryable (awaiting complete)', async () => {
  const deps = makeDeps({ file: fileIn(FILE_STATES.SASIssued) });
  const scanner = { async scan() { return { result: SCAN_RESULTS.Clean }; } };
  await assert.rejects(() => scanQuarantineBlob(blobInput(), deps, scanner, {}),
    (err) => err instanceof RetryableScanError && err.reason === 'awaiting-scan-pending');
});

test('already-processed file is skipped', async () => {
  const deps = makeDeps({ file: fileIn(FILE_STATES.Ready) });
  const scanner = { async scan() { throw new Error('should not scan'); } };
  const res = await scanQuarantineBlob(blobInput(), deps, scanner, {});
  assert.equal(res.outcome, 'skipped');
  assert.match(res.reason, /already-Ready/);
});

test('core retryable outcome bubbles up as retryable', async () => {
  const deps = makeDeps({ file: fileIn(FILE_STATES.ScanPending) });
  const scanner = { async scan() { return { verdict: 'clean', result: SCAN_RESULTS.Clean }; } };
  const process = async () => ({ success: false, errorCode: 'INFRASTRUCTURE_RETRYABLE' });
  await assert.rejects(() => scanQuarantineBlob(blobInput(), deps, scanner, { processScanResult: process }),
    (err) => err instanceof RetryableScanError && err.reason === 'processing-retryable');
});

test('blob-path mismatch is skipped without scanning', async () => {
  const deps = makeDeps({ file: { ...fileIn(FILE_STATES.ScanPending), quarantineBlobPath: 'recruitment/2026/other/x/y.docx' } });
  const scanner = { async scan() { throw new Error('should not scan'); } };
  const res = await scanQuarantineBlob(blobInput(), deps, scanner, {});
  assert.equal(res.outcome, 'skipped');
  assert.equal(res.reason, 'blob-path-mismatch');
});
