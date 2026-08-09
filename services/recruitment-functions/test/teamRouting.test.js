'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_TEAM_NOTIFICATION_RECIPIENTS,
  SHOREVEST_LOGO_URL,
  teamNotificationRecipients,
  createRecruitmentGraph,
  createNotificationFirstDispatcher
} = require('../src/appFactory');
const { NOTIFICATION_EVENTS: EVENTS } = require('../../../api/recruitment/core/constants');

// This file also provides the deployment regression gate for recruitment notifications.
test('team notifications default to both monitored ShoreVest inboxes', () => {
  assert.deepEqual(teamNotificationRecipients({}), [
    'careers@shorevest.com',
    'hr@shorevest.com'
  ]);
  assert.deepEqual(DEFAULT_TEAM_NOTIFICATION_RECIPIENTS, [
    'careers@shorevest.com',
    'hr@shorevest.com'
  ]);
});

test('team notification recipients can be overridden without affecting candidate mail routing', async () => {
  const drafts = [];
  const graph = {
    createDraftMessage(mailbox, message, extendedProperty) {
      drafts.push({ mailbox, message, extendedProperty });
      return Promise.resolve({ id: 'draft-1' });
    }
  };
  const wrapped = createRecruitmentGraph(graph, {
    RECRUITMENT_TEAM_NOTIFICATION_RECIPIENTS: 'careers@shorevest.com,hr@shorevest.com'
  });

  await wrapped.createDraftMessage(
    'careers@shorevest.com',
    { toRecipients: [{ emailAddress: { address: 'careers@shorevest.com' } }] },
    { id: 'String marker Name ShoreVestRecruitmentTeamApplicationReference' }
  );
  assert.deepEqual(
    drafts[0].message.toRecipients.map((recipient) => recipient.emailAddress.address),
    ['careers@shorevest.com', 'hr@shorevest.com']
  );

  await wrapped.createDraftMessage(
    'careers@shorevest.com',
    {
      subject: 'Application received | Legal Assistant | ShoreVest',
      body: { contentType: 'HTML', content: '<p>legacy body</p>' },
      toRecipients: [{ emailAddress: { address: 'candidate@example.com' } }]
    },
    {
      id: 'String marker Name ShoreVestApplicationReference',
      value: 'SV-APP-2026-1234567890ABCDEF'
    }
  );
  assert.equal(drafts[1].message.toRecipients[0].emailAddress.address, 'candidate@example.com');
  assert.match(drafts[1].message.body.content, new RegExp(SHOREVEST_LOGO_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(drafts[1].message.body.content, /Application received/);
  assert.match(drafts[1].message.body.content, /SV-APP-2026-1234567890ABCDEF/);
  assert.doesNotMatch(drafts[1].message.body.content, /View Open Roles/i);
  assert.doesNotMatch(drafts[1].message.body.content, /legacy body/i);
});

test('legacy generic notification fields are not projected to SharePoint', async () => {
  const projections = [];
  const graph = {
    createDraftMessage() {
      return Promise.resolve({ id: 'draft-1' });
    },
    upsertListItem(options) {
      projections.push(options);
      return Promise.resolve({ itemId: 'item-1' });
    }
  };
  const wrapped = createRecruitmentGraph(graph, {});

  await wrapped.upsertListItem({
    siteId: 'site',
    listId: 'list',
    keyField: 'ApplicationReference',
    keyValue: 'SV-APP-2026-1234567890ABCDEF',
    fields: {
      ApplicationReference: 'SV-APP-2026-1234567890ABCDEF',
      NotificationState: 'Pending',
      NotificationEventKey: 'legacy-key',
      NotificationSentAtUtc: null,
      NotificationAttemptCount: 0,
      NotificationLastErrorCode: null,
      AppRecvNotificationState: 'Pending',
      AppRecvNotificationEventKey: 'current-key'
    }
  });

  assert.equal(projections.length, 1);
  assert.equal(projections[0].fields.NotificationState, undefined);
  assert.equal(projections[0].fields.NotificationEventKey, undefined);
  assert.equal(projections[0].fields.NotificationSentAtUtc, undefined);
  assert.equal(projections[0].fields.NotificationAttemptCount, undefined);
  assert.equal(projections[0].fields.NotificationLastErrorCode, undefined);
  assert.equal(projections[0].fields.AppRecvNotificationState, 'Pending');
  assert.equal(projections[0].fields.AppRecvNotificationEventKey, 'current-key');
});

test('new-application alert is delivered before SharePoint projection and survives projection failure', async () => {
  const calls = [];
  const projectionError = Object.assign(new Error('SharePoint unavailable'), { code: 'GRAPH_UNAVAILABLE' });
  const dispatcher = {
    async deliver() {
      throw new Error('base deliver should not handle ApplicationReceived');
    },
    async notifyTeam(event) {
      calls.push('notify');
      return {
        deliveryReference: 'team-mail:1',
        event: { ...event, deliveryCheckpoint: { teamNotificationDraftMessageId: 'draft-1' } }
      };
    },
    async project() {
      calls.push('project');
      throw projectionError;
    }
  };
  const wrapped = createNotificationFirstDispatcher(dispatcher);

  await assert.rejects(
    wrapped.deliver({
      type: EVENTS.ApplicationReceived,
      applicationReference: 'SV-APP-2026-1234567890ABCDEF'
    }, {}),
    projectionError
  );
  assert.deepEqual(calls, ['notify', 'project']);
});
