'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { normalizeEventGridEvent, normalizeStorageBlobCreatedEvent } = require('../src/lib/eventGrid');

const cfg = { uploadStorageAccountName: 'acct', quarantineContainer: 'recruitment-quarantine' };
const appRef = 'SV-APP-2026-0123456789ABCDEF';
const fileRef = 'SV-FILE-FEDCBA9876543210';

function ev(result = 'No threats found') {
  return {
    id: 'evt1',
    eventType: 'Microsoft.Security.MalwareScanningResult',
    eventTime: '2026-07-20T00:00:00Z',
    dataVersion: '1.0',
    metadataVersion: '1',
    data: {
      blobUri: `https://acct.blob.core.windows.net/recruitment-quarantine/recruitment/2026/legal-assistant/${appRef}/${fileRef}.pdf`,
      scanResultType: result,
      blobETag: 'etag',
      sha256: 'a'.repeat(64),
      correlationId: 'corr-1'
    }
  };
}

test('normalizes official malware scanning event fields', () => {
  const normalized = normalizeEventGridEvent(ev(), cfg);
  assert.equal(normalized.applicationReference, appRef);
  assert.equal(normalized.fileReference, fileRef);
  assert.equal(normalized.result, 'Clean');
  assert.equal(normalized.blobETag, 'etag');
  assert.equal(normalized.sha256, 'a'.repeat(64));
});

test('rejects malformed and wrong scope events', () => {
  assert.throws(() => normalizeEventGridEvent({ ...ev(), eventType: 'Other' }, cfg));
  assert.throws(() => normalizeEventGridEvent({ ...ev(), data: { ...ev().data, blobUri: `https://other.blob.core.windows.net/recruitment-quarantine/recruitment/2026/r/${appRef}/${fileRef}.pdf` } }, cfg));
  assert.throws(() => normalizeEventGridEvent({ ...ev(), data: { ...ev().data, blobUri: `https://acct.blob.core.windows.net/clean/recruitment/2026/r/${appRef}/${fileRef}.pdf` } }, cfg));
});

test('unknown scan results are not treated as clean', () => {
  assert.throws(() => normalizeEventGridEvent(ev('Suspicious'), cfg));
});

function blobCreated(overrides = {}) {
  return {
    id: 'blob-evt-1',
    eventType: 'Microsoft.Storage.BlobCreated',
    eventTime: '2026-08-08T18:58:36Z',
    data: {
      api: 'PutBlob',
      url: `https://acct.blob.core.windows.net/recruitment-quarantine/recruitment/2026/legal-assistant/${appRef}/${fileRef}.docx`,
      contentLength: 36870
    },
    ...overrides
  };
}

test('normalizes a BlobCreated event into scan inputs', () => {
  const n = normalizeStorageBlobCreatedEvent(blobCreated(), cfg);
  assert.equal(n.eventId, 'blob-evt-1');
  assert.equal(n.container, 'recruitment-quarantine');
  assert.equal(n.roleId, 'legal-assistant');
  assert.equal(n.applicationReference, appRef);
  assert.equal(n.fileReference, fileRef);
  assert.equal(n.extension, 'docx');
  assert.equal(n.contentLength, 36870);
});

test('accepts CloudEvents-schema BlobCreated (type/time)', () => {
  const ce = { id: 'ce-1', type: 'Microsoft.Storage.BlobCreated', time: '2026-08-08T18:58:36Z',
    data: { url: `https://acct.blob.core.windows.net/recruitment-quarantine/recruitment/2026/legal-assistant/${appRef}/${fileRef}.pdf` } };
  const n = normalizeStorageBlobCreatedEvent(ce, cfg);
  assert.equal(n.fileReference, fileRef);
  assert.equal(n.extension, 'pdf');
});

test('rejects BlobCreated outside quarantine, wrong account, or bad path', () => {
  assert.throws(() => normalizeStorageBlobCreatedEvent(blobCreated({ eventType: 'Microsoft.Storage.BlobDeleted' }), cfg), /wrong event type/);
  assert.throws(() => normalizeStorageBlobCreatedEvent(blobCreated({ data: { url: `https://other.blob.core.windows.net/recruitment-quarantine/recruitment/2026/r/${appRef}/${fileRef}.docx` } }), cfg), /wrong storage account/);
  assert.throws(() => normalizeStorageBlobCreatedEvent(blobCreated({ data: { url: `https://acct.blob.core.windows.net/recruitment-clean/recruitment/2026/r/${appRef}/${fileRef}.docx` } }), cfg), /wrong container/);
  assert.throws(() => normalizeStorageBlobCreatedEvent(blobCreated({ data: { url: `https://acct.blob.core.windows.net/recruitment-quarantine/uploads/random.docx` } }), cfg), /malformed blob path/);
});
