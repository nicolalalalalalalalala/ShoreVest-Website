'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { NOTIFICATION_EVENTS: EVENTS } = require('../../../api/recruitment/core/constants');
const { applicationFields } = require('../src/outbox/dispatcher');

const application = {
  applicationReference: 'SV-APP-2026-ABC123',
  candidateSubmissionStatus: 'Submitted',
  finalizedAtUtc: '2026-07-22T00:05:00.000Z'
};

test('application-received and documents-ready states use different columns', () => {
  const received = applicationFields(application, {
    type: EVENTS.ApplicationReceived,
    idempotencyKey: 'received-key'
  });
  const documents = applicationFields(application, {
    type: EVENTS.DocumentsReady,
    idempotencyKey: 'documents-key'
  });

  assert.equal(received.AppRecvNotificationState, 'Pending');
  assert.equal(received.AppRecvNotificationEventKey, 'received-key');
  assert.equal(received.DocsRdyNotificationState, undefined);

  assert.equal(documents.DocsRdyNotificationState, 'Pending');
  assert.equal(documents.DocsRdyNotificationEventKey, 'documents-key');
  assert.equal(documents.AppRecvNotificationState, undefined);
  assert.equal(documents.NotificationState, undefined);
});

test('purge clears both notification state machines', () => {
  const purged = applicationFields({
    ...application,
    retentionState: 'Purged',
    candidateSubmissionStatus: 'Deleted'
  }, {
    type: EVENTS.RetentionPurged,
    idempotencyKey: 'purged-key'
  });

  assert.equal(purged.NotificationState, null);
  assert.equal(purged.AppRecvNotificationState, null);
  assert.equal(purged.DocsRdyNotificationState, null);
  assert.equal(purged.AppRecvNotificationEventKey, null);
  assert.equal(purged.DocsRdyNotificationEventKey, null);
});
