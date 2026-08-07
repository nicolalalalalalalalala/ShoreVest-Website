'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  NOTIFICATION_EVENTS: EVENTS
} = require('../../../api/recruitment/core/constants');
const {
  ACKNOWLEDGEMENT_PROPERTY_ID,
  applicationFields,
  fileFields,
  acknowledgementMessage,
  classifyAcknowledgementMessages,
  createOutboxDispatcher
} = require('../src/outbox/dispatcher');

function application(patch = {}) {
  return {
    applicationReference: 'SV-APP-2026-ABC123',
    roleId: 'legal-assistant',
    roleTitle: 'Legal Assistant',
    roleDepartment: 'Legal Department',
    roleLocation: 'Guangzhou, China',
    locale: 'en',
    source: 'website',
    candidateName: 'Candidate Name',
    candidateEmail: 'candidate@example.com',
    candidateTelephone: '+1 212 555 0100',
    candidateLocation: 'New York, US',
    linkedInUrl: 'https://www.linkedin.com/in/example',
    coverNote: 'Short note',
    privacyNoticeVersion: 'approved-v1',
    privacyAcceptedAtUtc: '2026-07-22T00:00:00.000Z',
    initiatedAtUtc: '2026-07-22T00:00:00.000Z',
    submittedAtClientUtc: '2026-07-22T00:00:00.000Z',
    submittedAtServerUtc: '2026-07-22T00:01:00.000Z',
    finalizedAtUtc: '2026-07-22T00:01:00.000Z',
    accuracyConfirmedAtUtc: '2026-07-22T00:01:00.000Z',
    candidateSubmissionStatus: 'Submitted',
    technicalStatus: 'Scanning',
    hiringStage: 'New',
    fileCount: 1,
    readyFileCount: 0,
    requiresManualReview: false,
    retentionReviewDate: '2027-07-22T00:00:00.000Z',
    lastUpdatedAtUtc: '2026-07-22T00:01:00.000Z',
    ...patch
  };
}

function file(patch = {}) {
  return {
    fileReference: 'SV-FILE-ABC12345',
    applicationReference: 'SV-APP-2026-ABC123',
    filePurpose: 'CV',
    originalFileName: 'candidate-cv.pdf',
    declaredMimeType: 'application/pdf',
    detectedFileType: 'pdf',
    sizeBytes: 1024,
    expectedHash: 'a'.repeat(64),
    quarantineBlobPath: 'recruitment/2026/legal-assistant/SV-APP-2026-ABC123/SV-FILE-ABC12345.pdf',
    cleanBlobPath: null,
    quarantineRemovalPending: false,
    technicalStatus: 'ScanPending',
    scanResult: null,
    scanEventId: null,
    uploadVerifiedAtUtc: '2026-07-22T00:01:00.000Z',
    scanStartedAtUtc: '2026-07-22T00:01:00.000Z',
    scanCompletedAtUtc: null,
    readyAtUtc: null,
    quarantineRemovedAtUtc: null,
    retentionReviewDate: '2027-07-22T00:00:00.000Z',
    lastUpdatedAtUtc: '2026-07-22T00:01:00.000Z',
    ...patch
  };
}

function config() {
  return {
    sharePoint: {
      siteId: 'site-id',
      applicationsListId: 'applications-list',
      filesListId: 'files-list'
    },
    candidateAcknowledgement: {
      enabled: true,
      templateApproved: true,
      mailbox: 'hr@shorevest.com',
      privacyNoticeUrl: 'https://shorevest.com/privacy-policy/'
    }
  };
}

function graphStub(overrides = {}) {
  return {
    async upsertListItem() {
      return { itemId: '1', created: true };
    },
    async findMessagesByExtendedProperty() {
      return [];
    },
    async getMessage() {
      return null;
    },
    async createDraftMessage() {
      return { id: 'draft-1', isDraft: true };
    },
    async sendDraftMessage() {
      return { accepted: true };
    },
    ...overrides
  };
}

function event(patch = {}) {
  return {
    id: 'outbox:CandidateAcknowledgementRequested:outbox:app:ack',
    _etag: 'etag-1',
    type: EVENTS.CandidateAcknowledgementRequested,
    applicationReference: 'SV-APP-2026-ABC123',
    idempotencyKey: 'outbox:app:ack',
    attemptCount: 1,
    state: 'Processing',
    ...patch
  };
}

function dependencies(patch = {}) {
  return {
    applicationStore: {
      async getApplication() {
        return application();
      },
      async getFile() {
        return file();
      }
    },
    projectionReader: {
      async getFilesForApplication() {
        return [file()];
      }
    },
    outboxCheckpoint: {
      async checkpoint(current, checkpoint) {
        return {
          ...current,
          _etag: 'etag-2',
          deliveryCheckpoint: checkpoint
        };
      }
    },
    ...patch
  };
}

test('application projection marks only approved HR notifications pending', () => {
  const received = applicationFields(application(), {
    type: EVENTS.ApplicationReceived,
    idempotencyKey: 'outbox:application:received'
  });
  assert.equal(received.NotificationState, 'Pending');
  assert.equal(received.NotificationEventKey, 'outbox:application:received');

  const malicious = applicationFields(application({ technicalStatus: 'Blocked' }), {
    type: EVENTS.MaliciousFileDetected,
    idempotencyKey: 'outbox:file:malicious'
  });
  assert.equal(malicious.NotificationState, undefined);
});

test('file projection contains metadata but no document bytes or public URL', () => {
  const fields = fileFields(file());
  assert.equal(fields.FileReference, 'SV-FILE-ABC12345');
  assert.equal(fields.OriginalFileName, 'candidate-cv.pdf');
  assert.equal(fields.bytes, undefined);
  assert.equal(fields.PublicUrl, undefined);
  assert.equal(fields.SasUrl, undefined);
});

test('projection upserts the application and every file in the application partition', async () => {
  const upserts = [];
  const dispatcher = createOutboxDispatcher({
    graph: graphStub({
      async upsertListItem(input) {
        upserts.push(input);
        return { itemId: String(upserts.length), created: true };
      }
    }),
    config: config()
  });

  const result = await dispatcher.deliver({
    type: EVENTS.ApplicationReceived,
    applicationReference: 'SV-APP-2026-ABC123',
    idempotencyKey: 'outbox:application:received'
  }, dependencies({
    projectionReader: {
      async getFilesForApplication() {
        return [file(), file({ fileReference: 'SV-FILE-SECOND', filePurpose: 'SupportingDocument' })];
      }
    }
  }));

  assert.equal(upserts.length, 3);
  assert.equal(upserts[0].keyField, 'ApplicationReference');
  assert.equal(upserts[1].keyField, 'FileReference');
  assert.equal(upserts[2].keyValue, 'SV-FILE-SECOND');
  assert.equal(result.deliveryReference, 'application:1|file:2|file:3');
});

test('file-specific events do not query unrelated application files', async () => {
  let projectionReads = 0;
  let upserts = 0;
  const dispatcher = createOutboxDispatcher({
    graph: graphStub({
      async upsertListItem() {
        upserts += 1;
        return { itemId: String(upserts), created: false };
      }
    }),
    config: config()
  });

  await dispatcher.deliver({
    type: EVENTS.MaliciousFileDetected,
    applicationReference: 'SV-APP-2026-ABC123',
    fileReference: 'SV-FILE-ABC12345',
    idempotencyKey: 'outbox:file:malicious'
  }, dependencies({
    applicationStore: {
      async getApplication() {
        return application({ technicalStatus: 'Blocked' });
      },
      async getFile() {
        return file({ technicalStatus: 'Malicious', scanResult: 'Malicious' });
      }
    },
    projectionReader: {
      async getFilesForApplication() {
        projectionReads += 1;
        return [];
      }
    }
  }));

  assert.equal(upserts, 2);
  assert.equal(projectionReads, 0);
});

test('acknowledgement message is bilingual, contains fraud wording and no attachments', () => {
  const english = acknowledgementMessage(application(), config().candidateAcknowledgement);
  assert.ok(english.subject.includes('Application received'));
  assert.ok(english.body.content.includes('never ask a candidate to make a payment'));
  assert.equal(english.attachments, undefined);

  const chinese = acknowledgementMessage(
    application({ locale: 'zh-CN', roleTitle: '法务专员', candidateName: '候选人' }),
    config().candidateAcknowledgement
  );
  assert.ok(chinese.body.content.includes('不会在招聘过程中要求候选人付款'));
});

test('duplicate acknowledgement message state fails permanently', () => {
  assert.throws(
    () => classifyAcknowledgementMessages([
      { id: 'one', isDraft: false },
      { id: 'two', isDraft: true }
    ]),
    (error) => error.code === 'CANDIDATE_ACKNOWLEDGEMENT_DUPLICATE_STATE' && error.permanent === true
  );
});

test('candidate acknowledgement remains blocked without explicit template approval', async () => {
  const dispatcher = createOutboxDispatcher({
    graph: graphStub(),
    config: {
      ...config(),
      candidateAcknowledgement: {
        ...config().candidateAcknowledgement,
        templateApproved: false
      }
    }
  });

  await assert.rejects(
    () => dispatcher.deliver(event(), dependencies()),
    (error) => error.code === 'CANDIDATE_ACKNOWLEDGEMENT_DISABLED' && error.permanent === true
  );
});

test('new acknowledgement draft is checkpointed before it is sent', async () => {
  const order = [];
  const dispatcher = createOutboxDispatcher({
    graph: graphStub({
      async createDraftMessage(mailbox, message, property) {
        order.push('draft');
        assert.equal(mailbox, 'hr@shorevest.com');
        assert.equal(message.toRecipients[0].emailAddress.address, 'candidate@example.com');
        assert.equal(message.attachments, undefined);
        assert.equal(property.id, ACKNOWLEDGEMENT_PROPERTY_ID);
        assert.equal(property.value, 'SV-APP-2026-ABC123');
        return { id: 'immutable-draft-1', isDraft: true };
      },
      async sendDraftMessage(mailbox, messageId) {
        order.push('send');
        assert.equal(mailbox, 'hr@shorevest.com');
        assert.equal(messageId, 'immutable-draft-1');
      }
    }),
    config: config()
  });

  const result = await dispatcher.deliver(event(), dependencies({
    outboxCheckpoint: {
      async checkpoint(current, checkpoint) {
        order.push('checkpoint');
        assert.equal(checkpoint.draftMessageId, 'immutable-draft-1');
        return { ...current, _etag: 'etag-2', deliveryCheckpoint: checkpoint };
      }
    }
  }));

  assert.deepEqual(order, ['draft', 'checkpoint', 'send']);
  assert.equal(result.deliveryReference, 'mail:immutable-draft-1');
  assert.equal(result.event._etag, 'etag-2');
});

test('retry reconciles an already-sent acknowledgement without creating or sending', async () => {
  let drafts = 0;
  let sends = 0;
  let checkpoints = 0;
  const dispatcher = createOutboxDispatcher({
    graph: graphStub({
      async findMessagesByExtendedProperty() {
        return [{ id: 'immutable-sent-1', isDraft: false, sentDateTime: '2026-07-22T00:02:00Z' }];
      },
      async createDraftMessage() {
        drafts += 1;
      },
      async sendDraftMessage() {
        sends += 1;
      }
    }),
    config: config()
  });

  const result = await dispatcher.deliver(event(), dependencies({
    outboxCheckpoint: {
      async checkpoint() {
        checkpoints += 1;
      }
    }
  }));

  assert.equal(result.deliveryReference, 'mail:immutable-sent-1');
  assert.equal(result.reconciled, true);
  assert.equal(drafts, 0);
  assert.equal(sends, 0);
  assert.equal(checkpoints, 0);
});

test('retry adopts an existing tagged draft and checkpoints it before sending', async () => {
  let creates = 0;
  let checkpointed;
  let sent;
  const dispatcher = createOutboxDispatcher({
    graph: graphStub({
      async findMessagesByExtendedProperty() {
        return [{ id: 'existing-draft', isDraft: true }];
      },
      async createDraftMessage() {
        creates += 1;
      },
      async sendDraftMessage(_, id) {
        sent = id;
      }
    }),
    config: config()
  });

  await dispatcher.deliver(event(), dependencies({
    outboxCheckpoint: {
      async checkpoint(current, checkpoint) {
        checkpointed = checkpoint.draftMessageId;
        return { ...current, _etag: 'etag-2', deliveryCheckpoint: checkpoint };
      }
    }
  }));

  assert.equal(creates, 0);
  assert.equal(checkpointed, 'existing-draft');
  assert.equal(sent, 'existing-draft');
});

test('checkpointed draft is reused directly', async () => {
  let searches = 0;
  let creates = 0;
  let sent;
  const dispatcher = createOutboxDispatcher({
    graph: graphStub({
      async findMessagesByExtendedProperty() {
        searches += 1;
        return [];
      },
      async getMessage(_, id) {
        return { id, isDraft: true };
      },
      async createDraftMessage() {
        creates += 1;
      },
      async sendDraftMessage(_, id) {
        sent = id;
      }
    }),
    config: config()
  });

  const current = event({
    deliveryCheckpoint: { draftMessageId: 'checkpointed-draft' }
  });
  await dispatcher.deliver(current, dependencies());

  assert.equal(searches, 1);
  assert.equal(creates, 0);
  assert.equal(sent, 'checkpointed-draft');
});

test('missing checkpointed message does not create a replacement', async () => {
  let creates = 0;
  const dispatcher = createOutboxDispatcher({
    graph: graphStub({
      async getMessage() {
        return null;
      },
      async createDraftMessage() {
        creates += 1;
      }
    }),
    config: config()
  });

  await assert.rejects(
    () => dispatcher.deliver(event({
      deliveryCheckpoint: { draftMessageId: 'missing-draft' }
    }), dependencies()),
    (error) => error.code === 'CANDIDATE_ACKNOWLEDGEMENT_STATE_UNCERTAIN' && error.permanent !== true
  );
  assert.equal(creates, 0);
});

test('send failure carries the checkpointed event for a safe retry', async () => {
  const dispatcher = createOutboxDispatcher({
    graph: graphStub({
      async sendDraftMessage() {
        throw Object.assign(new Error('Graph unavailable'), {
          code: 'GRAPH_UNAVAILABLE',
          retryAfterMs: 3000
        });
      }
    }),
    config: config()
  });

  await assert.rejects(
    () => dispatcher.deliver(event(), dependencies()),
    (error) => error.code === 'GRAPH_UNAVAILABLE' &&
      error.event?._etag === 'etag-2' &&
      error.event?.deliveryCheckpoint?.draftMessageId === 'draft-1'
  );
});
