'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  teamNotificationMessage,
  classifyTeamNotificationMessages
} = require('../src/outbox/dispatcher');

function application() {
  return {
    applicationReference: 'SV-APP-2026-ABC123',
    roleTitle: 'Legal Assistant',
    candidateName: 'Candidate Name',
    candidateEmail: 'candidate@example.com',
    source: 'website',
    submittedAtServerUtc: '2026-08-09T01:00:00.000Z'
  };
}

test('Careers mailbox notification contains application metadata but no CV attachment or URL', () => {
  const message = teamNotificationMessage(application(), { mailbox: 'careers@shorevest.com' });
  assert.equal(message.toRecipients[0].emailAddress.address, 'careers@shorevest.com');
  assert.match(message.subject, /New ShoreVest application - Legal Assistant - SV-APP-2026-ABC123/);
  assert.match(message.body.content, /Candidate: Candidate Name/);
  assert.match(message.body.content, /Email: candidate@example\.com/);
  assert.match(message.body.content, /CV files are not attached/);
  assert.equal(message.attachments, undefined);
  assert.doesNotMatch(message.body.content, /blob\.core\.windows\.net|SharedAccessSignature|sig=/i);
});

test('duplicate Careers mailbox notification state fails closed', () => {
  assert.throws(
    () => classifyTeamNotificationMessages([
      { id: 'one', isDraft: false },
      { id: 'two', isDraft: false }
    ]),
    (error) => error && error.code === 'TEAM_NOTIFICATION_DUPLICATE_STATE' && error.permanent === true
  );
});
