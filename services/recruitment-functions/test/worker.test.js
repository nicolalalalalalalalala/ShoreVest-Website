'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { handleQueueMessage, decodeQueueMessage } = require('../src/scan/worker');
const { FILE_STATES, SCAN_RESULTS } = require('../../../api/recruitment/core/constants');

const appRef = 'SV-APP-2026-0123456789ABCDEF';
const fileRef = 'SV-FILE-FEDCBA9876543210';
const blobPath = `recruitment/2026/legal-assistant/${appRef}/${fileRef}.docx`;
const cfg = { uploadStorageAccountName: 'acct', quarantineContainer: 'recruitment-quarantine' };

function blobCreatedEvent() {
  return {
    id: 'blob-evt-1', eventType: 'Microsoft.Storage.BlobCreated', eventTime: '2026-08-08T18:58:36Z',
    data: { api: 'PutBlob', url: `https://acct.blob.core.windows.net/recruitment-quarantine/${blobPath}` }
  };
}

function b64(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64'); }

function deps(file) {
  return {
    config: cfg,
    applicationStore: { async getFile() { return file; } },
    storage: { async read() { return Buffer.from('cv'); } },
    now: async () => new Date('2026-09-06T12:00:00Z'),
    logger: { async log() {} }
  };
}

test('decodeQueueMessage handles base64 and raw JSON, single and array', () => {
  assert.equal(decodeQueueMessage(b64({ id: 'x' }))[0].id, 'x');
  assert.equal(decodeQueueMessage(JSON.stringify({ id: 'y' }))[0].id, 'y');
  assert.equal(decodeQueueMessage(b64([{ id: 'a' }, { id: 'b' }])).length, 2);
});

test('a clean CV message is scanned and deleted', async () => {
  const scanner = { async scan() { return { verdict: 'clean', result: SCAN_RESULTS.Clean }; } };
  const msg = { messageText: b64(blobCreatedEvent()), dequeueCount: 1 };
  const out = await handleQueueMessage(msg, deps(fileIn(FILE_STATES.ScanPending)), scanner, { processScanResult: async () => ({ success: true }) });
  assert.equal(out.action, 'delete');
});

test('transient state leaves the message for redelivery', async () => {
  const scanner = { async scan() { return { verdict: 'clean', result: SCAN_RESULTS.Clean }; } };
  const msg = { messageText: b64(blobCreatedEvent()), dequeueCount: 1 };
  const out = await handleQueueMessage(msg, deps(null), scanner, {}); // file not found -> retryable
  assert.equal(out.action, 'leave');
  assert.equal(out.reason, 'file-not-found');
});

test('exhausted retries poison the message', async () => {
  const scanner = { async scan() { return { verdict: 'clean', result: SCAN_RESULTS.Clean }; } };
  const msg = { messageText: b64(blobCreatedEvent()), dequeueCount: 5 };
  const out = await handleQueueMessage(msg, deps(null), scanner, { maxDequeue: 5 });
  assert.equal(out.action, 'poison');
});

test('non-recruitment events are acknowledged (deleted) without scanning', async () => {
  const scanner = { async scan() { throw new Error('should not scan'); } };
  const other = { id: 'z', eventType: 'Microsoft.Storage.BlobCreated', data: { url: 'https://acct.blob.core.windows.net/recruitment-quarantine/uploads/other.txt' } };
  const msg = { messageText: b64(other), dequeueCount: 1 };
  const out = await handleQueueMessage(msg, deps(fileIn(FILE_STATES.ScanPending)), scanner, {});
  assert.equal(out.action, 'delete');
});

function fileIn(status) {
  return { applicationReference: appRef, fileReference: fileRef, quarantineBlobPath: blobPath, technicalStatus: status, sizeBytes: 2 };
}
