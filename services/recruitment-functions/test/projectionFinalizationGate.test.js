'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { NOTIFICATION_EVENTS: EVENTS } = require('../../../api/recruitment/core/constants');
const { createOutboxDispatcher } = require('../src/outbox/dispatcher');
const { createFinalizationGatedDispatcher } = require('../src/outbox/finalizationGate');

function graphStub(counter) {
  return {
    async upsertListItem() {
      counter.upserts += 1;
      return { itemId: '1' };
    },
    async findMessagesByExtendedProperty() { return []; },
    async getMessage() { return null; },
    async createDraftMessage() { return { id: 'unused', isDraft: true }; },
    async sendDraftMessage() { return { accepted: true }; }
  };
}

function dispatcher(counter) {
  return createFinalizationGatedDispatcher(createOutboxDispatcher({
    graph: graphStub(counter),
    config: {
      sharePoint: {
        siteId: 'site-id',
        applicationsListId: 'applications-list',
        filesListId: 'files-list'
      },
      candidateAcknowledgement: { enabled: false, templateApproved: false }
    }
  }));
}

test('scan outcomes remain retryable and are not projected before candidate finalization', async () => {
  const counter = { upserts: 0, fileReads: 0 };

  await assert.rejects(
    () => dispatcher(counter).deliver({
      type: EVENTS.DocumentsReady,
      applicationReference: 'SV-APP-2026-ABC123',
      fileReference: 'SV-FILE-ABC12345',
      idempotencyKey: 'outbox:file:documents-ready'
    }, {
      applicationStore: {
        async getApplication() {
          return {
            applicationReference: 'SV-APP-2026-ABC123',
            candidateSubmissionStatus: 'Draft',
            finalizedAtUtc: null,
            technicalStatus: 'Ready'
          };
        },
        async getFile() {
          counter.fileReads += 1;
          return { fileReference: 'SV-FILE-ABC12345' };
        }
      }
    }),
    (error) => error.code === 'APPLICATION_NOT_FINALIZED' &&
      error.permanent === false &&
      error.retryable === true
  );

  assert.equal(counter.upserts, 0);
  assert.equal(counter.fileReads, 0);
});

test('the same pending outcome projects after finalization without a second event', async () => {
  const counter = { upserts: 0, fileReads: 0 };
  const application = {
    applicationReference: 'SV-APP-2026-ABC123',
    candidateSubmissionStatus: 'Submitted',
    finalizedAtUtc: '2026-07-23T00:00:00.000Z',
    technicalStatus: 'Ready'
  };

  const result = await dispatcher(counter).deliver({
    type: EVENTS.DocumentsReady,
    applicationReference: application.applicationReference,
    fileReference: 'SV-FILE-ABC12345',
    idempotencyKey: 'outbox:file:documents-ready'
  }, {
    applicationStore: {
      async getApplication() { return application; },
      async getFile() {
        counter.fileReads += 1;
        return {
          applicationReference: application.applicationReference,
          fileReference: 'SV-FILE-ABC12345'
        };
      }
    }
  });

  assert.equal(result.deliveryReference, 'application:1|file:1');
  assert.equal(counter.upserts, 2);
  assert.equal(counter.fileReads, 1);
});
