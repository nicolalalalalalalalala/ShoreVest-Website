const assert = require('assert');
const base = require('../assets/data/recruitment/roles.v1.json');
const { createMemoryAdapters, createMemoryBacking } = require('../api/recruitment/core/inMemoryAdapters');
const {
  initiateApplication,
  completeUpload,
  finalizeApplication,
  processScanResult,
  retryQuarantineCleanup
} = require('../api/recruitment/core/flows');
const {
  ERROR_CODES: E,
  SCAN_RESULTS: S,
  CONTAINERS,
  APPLICATION_STATES: A,
  FILE_STATES: F
} = require('../api/recruitment/core/constants');
const { makeTinyZip, makeDocxFixture, DOCX_LIMITS } = require('../api/recruitment/core/fileTypes');

function manifest() {
  const output = JSON.parse(JSON.stringify(base));
  output.roles = [Object.assign(
    output.roles.find((role) => role.id === 'legal-assistant'),
    {
      status: 'published',
      contentReviewRequired: false,
      application: {
        enabled: true,
        deadlineUtc: null,
        privacyNoticeVersion: 'approved-v1',
        allowedSources: ['website'],
        cv: {
          required: true,
          maxSizeBytes: DOCX_LIMITS.maxUncompressedSize + 1000,
          allowedExtensions: ['.pdf', '.docx'],
          allowedMimeTypes: [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ]
        }
      }
    }
  )];
  return output;
}

function req(
  id = '550e8400-e29b-41d4-a716-446655440100',
  file = { originalName: 'cv.pdf', declaredMimeType: 'application/pdf', sizeBytes: 9 }
) {
  return {
    roleId: 'legal-assistant',
    locale: 'en',
    source: 'website',
    clientSubmissionId: id,
    candidate: {
      fullName: 'Candidate Name',
      email: 'p@example.com',
      telephone: '',
      currentLocation: '',
      linkedinUrl: '',
      coverNote: ''
    },
    privacyAccepted: true,
    privacyNoticeVersion: 'approved-v1',
    submittedAtClientUtc: '2026-07-20T00:00:00Z',
    file
  };
}

function finalizationRequest(init, complete) {
  return {
    applicationReference: init.applicationReference,
    fileReference: init.fileReference,
    finalizationToken: complete.finalizationToken,
    privacyAccepted: true,
    accuracyConfirmed: true
  };
}

(async () => {
  let backing = createMemoryBacking();
  let deps = Array.from({ length: 8 }, (_, index) => createMemoryAdapters({
    manifest: manifest(),
    backing,
    async: true,
    leaseOwner: `i${index}`
  }));
  const concurrent = await Promise.all(deps.map((current) => initiateApplication(req(), current)));
  assert.ok(concurrent.every((result) => result.success));
  assert.strictEqual(backing.counters.applications, 1);
  assert.strictEqual(backing.counters.files, 1);

  for (const failure of ['sas', 'tokenSign', 'idempotencyComplete']) {
    backing = createMemoryBacking();
    const firstDeps = createMemoryAdapters({ manifest: manifest(), backing, failures: { [failure]: 1 } });
    const first = await initiateApplication(req('550e8400-e29b-41d4-a716-446655440101'), firstDeps);
    assert.strictEqual(first.errorCode, E.SUBMISSION_FAILED);
    const retry = await initiateApplication(
      req('550e8400-e29b-41d4-a716-446655440101'),
      createMemoryAdapters({ manifest: manifest(), backing })
    );
    assert.ok(retry.success);
    assert.strictEqual(backing.counters.applications, 1);
    assert.strictEqual(backing.counters.files, 1);
  }

  backing = createMemoryBacking();
  let currentDeps = createMemoryAdapters({ manifest: manifest(), backing, failures: { outbox: 1 } });
  let init = await initiateApplication(req('550e8400-e29b-41d4-a716-446655440102'), currentDeps);
  currentDeps.storage.put(
    CONTAINERS.quarantine,
    backing.files.get(init.fileReference).quarantineBlobPath,
    Buffer.from('%PDF-test'),
    'application/pdf'
  );
  const completed = await completeUpload({
    applicationReference: init.applicationReference,
    fileReference: init.fileReference,
    completionToken: init.completionToken
  }, currentDeps);
  assert.ok(completed.success);
  assert.strictEqual(backing.outbox.length, 0);

  const beforeFinalize = backing.apps.get(init.applicationReference);
  const failedFinalize = await finalizeApplication(finalizationRequest(init, completed), currentDeps);
  assert.strictEqual(failedFinalize.errorCode, E.INFRASTRUCTURE_RETRYABLE);
  assert.strictEqual(backing.apps.get(init.applicationReference).finalizedAtUtc, beforeFinalize.finalizedAtUtc);
  assert.strictEqual(backing.outbox.length, 0);

  const goodFinalize = await finalizeApplication(
    finalizationRequest(init, completed),
    createMemoryAdapters({ manifest: manifest(), backing })
  );
  assert.ok(goodFinalize.success);
  assert.strictEqual(backing.outbox.filter((event) => event.type === 'ApplicationReceived').length, 1);
  assert.strictEqual(backing.outbox.filter((event) => event.type === 'CandidateAcknowledgementRequested').length, 1);

  const repeatedCompletes = await Promise.all([1, 2, 3, 4].map(() => completeUpload({
    applicationReference: init.applicationReference,
    fileReference: init.fileReference,
    completionToken: init.completionToken
  }, createMemoryAdapters({ manifest: manifest(), backing, async: true }))));
  assert.ok(repeatedCompletes.every((result) => result.success));
  assert.strictEqual(backing.counters.verifications, 1);

  const repeatedFinalizes = await Promise.all([1, 2, 3, 4].map(() => finalizeApplication(
    finalizationRequest(init, completed),
    createMemoryAdapters({ manifest: manifest(), backing, async: true })
  )));
  assert.ok(repeatedFinalizes.every((result) => result.success));
  assert.strictEqual(backing.outbox.filter((event) => event.type === 'ApplicationReceived').length, 1);

  let file = backing.files.get(init.fileReference);
  let application = backing.apps.get(init.applicationReference);
  assert.rejects(() => currentDeps.applicationStore.commitAggregate({
    expectedVersion: 0,
    application,
    files: [file],
    outboxEvents: []
  }));

  backing = createMemoryBacking();
  currentDeps = createMemoryAdapters({ manifest: manifest(), backing });
  init = await initiateApplication(req('550e8400-e29b-41d4-a716-446655440103'), currentDeps);
  currentDeps.storage.put(
    CONTAINERS.quarantine,
    backing.files.get(init.fileReference).quarantineBlobPath,
    Buffer.from('%PDF-test'),
    'application/pdf'
  );
  await completeUpload({
    applicationReference: init.applicationReference,
    fileReference: init.fileReference,
    completionToken: init.completionToken
  }, currentDeps);
  file = backing.files.get(init.fileReference);
  const failCommit = createMemoryAdapters({ manifest: manifest(), backing, failures: { applicationWrite: 1 } });
  assert.strictEqual((await processScanResult({
    eventId: 'clean-fail',
    fileReference: init.fileReference,
    blobPath: file.quarantineBlobPath,
    result: S.Clean,
    scannedAtUtc: '2026-07-20T00:05:00Z'
  }, failCommit)).errorCode, E.INFRASTRUCTURE_RETRYABLE);
  assert.ok(backing.blobs.has(`${CONTAINERS.clean}/${file.quarantineBlobPath}`));
  assert.ok((await processScanResult({
    eventId: 'clean-fail',
    fileReference: init.fileReference,
    blobPath: file.quarantineBlobPath,
    result: S.Clean,
    scannedAtUtc: '2026-07-20T00:06:00Z'
  }, createMemoryAdapters({ manifest: manifest(), backing }))).success);
  file = backing.files.get(init.fileReference);
  assert.strictEqual(file.technicalStatus, F.Ready);
  backing.blobs.delete(`${CONTAINERS.quarantine}/${file.quarantineBlobPath}`);

  backing = createMemoryBacking();
  currentDeps = createMemoryAdapters({ manifest: manifest(), backing, failures: { quarantineDelete: 1 } });
  init = await initiateApplication(req('550e8400-e29b-41d4-a716-446655440104'), currentDeps);
  currentDeps.storage.put(
    CONTAINERS.quarantine,
    backing.files.get(init.fileReference).quarantineBlobPath,
    Buffer.from('%PDF-test'),
    'application/pdf'
  );
  await completeUpload({
    applicationReference: init.applicationReference,
    fileReference: init.fileReference,
    completionToken: init.completionToken
  }, currentDeps);
  file = backing.files.get(init.fileReference);
  assert.ok((await processScanResult({
    eventId: 'clean-delete-fail',
    fileReference: init.fileReference,
    blobPath: file.quarantineBlobPath,
    result: S.Clean,
    scannedAtUtc: '2026-07-20T00:05:00Z'
  }, currentDeps)).success);
  assert.strictEqual(backing.files.get(init.fileReference).quarantineRemovalPending, true);
  assert.strictEqual(backing.outbox.filter((event) => event.type === 'QuarantineCleanupRequired').length, 1);
  assert.ok((await retryQuarantineCleanup(
    { fileReference: init.fileReference },
    createMemoryAdapters({ manifest: manifest(), backing })
  )).success);

  backing = createMemoryBacking();
  currentDeps = createMemoryAdapters({ manifest: manifest(), backing, failures: { quarantineDelete: 1 } });
  init = await initiateApplication(req('550e8400-e29b-41d4-a716-446655440105'), currentDeps);
  currentDeps.storage.put(
    CONTAINERS.quarantine,
    backing.files.get(init.fileReference).quarantineBlobPath,
    Buffer.from('%PDF-test'),
    'application/pdf'
  );
  await completeUpload({
    applicationReference: init.applicationReference,
    fileReference: init.fileReference,
    completionToken: init.completionToken
  }, currentDeps);
  file = backing.files.get(init.fileReference);
  assert.ok((await processScanResult({
    eventId: 'mal',
    fileReference: init.fileReference,
    blobPath: file.quarantineBlobPath,
    result: S.Malicious,
    scannedAtUtc: '2026-07-20T00:05:00Z'
  }, currentDeps, { deleteMaliciousQuarantine: true })).success);
  assert.strictEqual(backing.apps.get(init.applicationReference).technicalStatus, A.Blocked);
  assert.ok(backing.blobs.has(`${CONTAINERS.quarantine}/${file.quarantineBlobPath}`));

  assert.strictEqual(require('../api/recruitment/core/fileTypes').detect(makeTinyZip([
    { name: '[Content_Types].xml', data: 'x' },
    { name: 'word/document.xml', data: 'x' }
  ])), 'zip');
  assert.strictEqual(require('../api/recruitment/core/fileTypes').detect(makeDocxFixture()), 'docx');
  const bomb = makeDocxFixture(Array.from(
    { length: DOCX_LIMITS.maxEntries + 1 },
    (_, index) => ({ name: `word/extra-${index}.bin`, data: 'x' })
  ));
  assert.notStrictEqual(require('../api/recruitment/core/fileTypes').detect(bomb), 'docx');

  const nullComplete = await completeUpload(null, createMemoryAdapters({ manifest: manifest() }));
  assert.strictEqual(nullComplete.errorCode, E.VALIDATION_FAILED);
  currentDeps = createMemoryAdapters({
    manifest: manifest(),
    failures: { logger: 1, idempotencyFailureRecord: 1, sas: 1 }
  });
  assert.strictEqual((await initiateApplication(
    req('550e8400-e29b-41d4-a716-446655440106'),
    currentDeps
  )).errorCode, E.SUBMISSION_FAILED);

  console.log('phase 2a.2 recruitment distributed-systems tests passed');
})();
