const assert = require('assert');
const client = require('../assets/js/recruitment-application');

assert.deepStrictEqual(
  client.parseParams('?role=legal-assistant&source=website'),
  { role: 'legal-assistant', source: 'website' }
);
assert.deepStrictEqual(
  client.parseParams('?role=legal-assistant&source=javascript%3Aalert(1)'),
  { role: 'legal-assistant', source: 'direct' }
);
assert.deepStrictEqual(
  client.parseParams('?role=bad%20role&source=linkedin'),
  { role: '', source: 'linkedin' }
);

assert.strictEqual(client.declaredMime({ name: 'cv.pdf', type: '' }), 'application/pdf');
assert.strictEqual(
  client.declaredMime({ name: 'cv.docx', type: '' }),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
);
assert.strictEqual(client.declaredMime({ name: 'cv.exe', type: '' }), '');
assert.strictEqual(client.validEmail('candidate@example.com'), true);
assert.strictEqual(client.validEmail('bad-address'), false);
assert.strictEqual(client.validLinkedIn('https://www.linkedin.com/in/candidate'), true);
assert.strictEqual(client.validLinkedIn('http://www.linkedin.com/in/candidate'), false);
assert.strictEqual(client.validLinkedIn('https://linkedin.com.attacker.example/in/candidate'), false);

function role(enabled = true) {
  return {
    id: 'legal-assistant',
    status: 'published',
    contentReviewRequired: false,
    title: { en: 'Legal Assistant', 'zh-CN': '法务专员' },
    application: {
      enabled,
      privacyNoticeVersion: 'privacy-policy-2026-04-08',
      deadlineUtc: null,
      allowedSources: ['website', 'linkedin', 'direct', 'other'],
      cv: {
        required: true,
        maxSizeBytes: 10485760,
        allowedExtensions: ['.pdf', '.docx'],
        allowedMimeTypes: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]
      }
    }
  };
}

assert.strictEqual(client.resolveRole({ roles: [role()] }, 'legal-assistant', 'en').ok, true);
assert.strictEqual(client.resolveRole({ roles: [role(false)] }, 'legal-assistant', 'en').reason, 'closed');
const noPrivacy = role();
noPrivacy.application.privacyNoticeVersion = null;
assert.strictEqual(client.resolveRole({ roles: [noPrivacy] }, 'legal-assistant', 'en').reason, 'closed');
const draft = role();
draft.status = 'draft';
assert.strictEqual(client.resolveRole({ roles: [draft] }, 'legal-assistant', 'en').reason, 'closed');

assert.strictEqual(client.MANIFEST_PATH, '../assets/data/recruitment/roles.v1.json');
assert.strictEqual(client.PUBLIC_CONFIG_PATH, '../assets/data/recruitment/public-config.json');
console.log('recruitment application client tests passed');
