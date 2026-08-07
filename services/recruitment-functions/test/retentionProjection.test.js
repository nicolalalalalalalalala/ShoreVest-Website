'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { NOTIFICATION_EVENTS: EVENTS } = require('../../../api/recruitment/core/constants');
const {
  PROJECTION_EVENTS,
  applicationFields,
  fileFields,
  createOutboxDispatcher
} = require('../src/outbox/dispatcher');

function graphStub(upserts) {
  return {
    async upsertListItem(input) {
      upserts.push(input);
      return { itemId: String(upserts.length), created: false };
    },
    async findMessagesByExtendedProperty() { return []; },
    async getMessage() { return null; },
    async createDraftMessage() { return { id: 'unused', isDraft: true }; },
    async sendDraftMessage() { return { accepted: true }; }
  };
}

const purgeEvent = {
  type: EVENTS.RetentionPurged,
  applicationReference: 'SV-APP-2026-ABC123',
  idempotencyKey: 'outbox:SV-APP-2026-ABC123:retention-purged'
};

const purgedApplication = {
  applicationReference: 'SV-APP-2026-ABC123',
  roleId: 'legal-assistant',
  roleTitle: 'Legal Assistant',
  locale: 'en',
  source: 'website',
  candidateName: '[deleted]',
  candidateEmail: null,
  privacyNoticeVersion: 'approved-v1',
  privacyAcceptedAtUtc: '2026-07-22T00:00:00.000Z',
  initiatedAtUtc: '2026-07-22T00:00:00.000Z',
  submittedAtServerUtc: '2026-07-22T00:01:00.000Z',
  finalizedAtUtc: '2026-07-22T00:01:00.000Z',
  accuracyConfirmedAtUtc: '2026-07-22T00:01:00.000Z',
  candidateSubmissionStatus: 'Deleted',
  technicalStatus: 'Deleted',
  hiringStage: 'Archived',
  fileCount: 1,
  readyFileCount: 0,
  requiresManualReview: false,
  retentionCategory: 'Submitted',
  retentionPolicyVersion: 'retention-v1',
  retentionDeleteAfterUtc: '2027-07-22T00:00:00.000Z',
  retentionState: 'Purged',
  retentionPurgedAtUtc: '2027-07-22T00:05:00.000Z',
  legalHold: false,
  lastUpdatedAtUtc: '2027-07-22T00:05:00.000Z'
};

const purgedFile = {
  fileReference: 'SV-FILE-ABC12345',
  applicationReference: 'SV-APP-2026-ABC123',
  filePurpose: 'CV',
  originalFileName: '[deleted]',
  declaredMimeType: 'application/pdf',
  detectedFileType: 'pdf',
  sizeBytes: 1024,
  expectedHash: null,
  quarantineBlobPath: null,
  cleanBlobPath: null,
  quarantineRemovalPending: false,
  technicalStatus: 'Removed',
  retentionCategory: 'Submitted',
  retentionPolicyVersion: 'retention-v1',
  retentionDeleteAfterUtc: '2027-07-22T00:00:00.000Z',
  retentionState: 'Purged',
  retentionPurgedAtUtc: '2027-07-22T00:05:00.000Z',
  legalHold: false,
  lastUpdatedAtUtc: '2027-07-22T00:05:00.000Z'
};

test('retention purge is a supported projection event', () => {
  assert.equal(PROJECTION_EVENTS.has(EVENTS.RetentionPurged), true);
});

test('purged SharePoint fields contain no candidate or Blob identifiers', () => {
  const application = applicationFields(purgedApplication, purgeEvent);
  const file = fileFields(purgedFile, purgeEvent);

  assert.equal(application.CandidateName, '[deleted]');
  assert.equal(application.CandidateEmail, '[deleted]');
  assert.equal(application.CandidateTelephone, null);
  assert.equal(application.CoverNote, null);
  assert.equal(application.TechnicalStatus, 'Deleted');
  assert.equal(application.RetentionState, 'Purged');
  assert.equal(application.NotificationState, null);

  assert.equal(file.OriginalFileName, '[deleted]');
  assert.equal(file.ExpectedHash, null);
  assert.equal(file.QuarantineBlobPath, null);
  assert.equal(file.CleanBlobPath, null);
  assert.equal(file.RetentionState, 'Purged');
});

test('retention purge updates the existing application and file rows', async () => {
  const upserts = [];
  const dispatcher = createOutboxDispatcher({
    graph: graphStub(upserts),
    config: {
      sharePoint: {
        siteId: 'site-id',
        applicationsListId: 'applications-list',
        filesListId: 'files-list'
      },
      candidateAcknowledgement: { enabled: false, templateApproved: false }
    }
  });

  const result = await dispatcher.deliver(purgeEvent, {
    applicationStore: {
      async getApplication() { return purgedApplication; }
    },
    projectionReader: {
      async getFilesForApplication() { return [purgedFile]; }
    }
  });

  assert.equal(upserts.length, 2);
  assert.equal(upserts[0].keyValue, purgedApplication.applicationReference);
  assert.equal(upserts[1].keyValue, purgedFile.fileReference);
  assert.equal(upserts[0].fields.RetentionState, 'Purged');
  assert.equal(upserts[1].fields.QuarantineBlobPath, null);
  assert.equal(result.deliveryReference, 'application:1|file:2');
});
