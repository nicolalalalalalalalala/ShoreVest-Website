'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_TEAM_NOTIFICATION_RECIPIENTS,
  teamNotificationRecipients,
  createRecruitmentGraph,
  createNotificationFirstDispatcher
} = require('../src/appFactory');
const { NOTIFICATION_EVENTS: EVENTS } = require('../../../api/recruitment/core/constants');

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

test('team notification recipients can be overridden without affecting candidate mail', async () => {
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
    { toRecipients: [{ emailAddress: { address: 'candidate@example.com' } }] },
    { id: 'String marker Name ShoreVestApplicationReference' }
  );
  assert.equal(drafts[1].message.toRecipients[0].emailAddress.address, 'candidate@example.com');
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
