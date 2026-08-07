'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  validShoreVestMailbox,
  validPrivacyNoticeUrl,
  loadConfig,
  validateConfig
} = require('../src/lib/config');

function deliveryEnvironment(patch = {}) {
  return {
    RECRUITMENT_ENVIRONMENT: 'production',
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com,https://www.shorevest.com',
    RECRUITMENT_MANAGED_IDENTITY_CLIENT_ID: '00000000-0000-0000-0000-000000000001',
    RECRUITMENT_COSMOS_ENDPOINT: 'https://example.documents.azure.com',
    RECRUITMENT_COSMOS_DATABASE: 'recruitment',
    RECRUITMENT_STORAGE_ACCOUNT_URL: 'https://example.blob.core.windows.net',
    RECRUITMENT_KEYVAULT_URL: 'https://example.vault.azure.net',
    RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME: 'completion',
    RECRUITMENT_FINGERPRINT_SECRET_NAME: 'fingerprint',
    RECRUITMENT_OUTBOX_DELIVERY_ENABLED: 'true',
    RECRUITMENT_SHAREPOINT_SITE_ID: 'site-id',
    RECRUITMENT_APPLICATIONS_LIST_ID: 'applications-list',
    RECRUITMENT_FILES_LIST_ID: 'files-list',
    RECRUITMENT_CANDIDATE_ACK_ENABLED: 'true',
    RECRUITMENT_CANDIDATE_ACK_TEMPLATE_APPROVED: 'true',
    RECRUITMENT_CANDIDATE_ACK_MAILBOX: 'recruitment@shorevest.com',
    RECRUITMENT_CANDIDATE_ACK_PRIVACY_URL: 'https://shorevest.com/privacy-policy/',
    ...patch
  };
}

test('recruitment mailbox must be a plain ShoreVest address', () => {
  assert.equal(validShoreVestMailbox('recruitment@shorevest.com'), true);
  assert.equal(validShoreVestMailbox('careers+applications@shorevest.com'), true);
  assert.equal(validShoreVestMailbox('Recruitment <recruitment@shorevest.com>'), false);
  assert.equal(validShoreVestMailbox('recruitment@example.com'), false);
  assert.equal(validShoreVestMailbox('recruitment@shorevest.com.attacker.example'), false);
  assert.equal(validShoreVestMailbox('recruitment@shorevest.com\r\nBcc: attacker@example.com'), false);
});

test('privacy link is restricted to the ShoreVest privacy page', () => {
  assert.equal(validPrivacyNoticeUrl('https://shorevest.com/privacy-policy/'), true);
  assert.equal(validPrivacyNoticeUrl('https://www.shorevest.com/privacy-policy'), true);
  assert.equal(validPrivacyNoticeUrl('http://shorevest.com/privacy-policy/'), false);
  assert.equal(validPrivacyNoticeUrl('https://shorevest.com/privacy-policy/?redirect=evil'), false);
  assert.equal(validPrivacyNoticeUrl('https://shorevest.com/privacy-policy/#section'), false);
  assert.equal(validPrivacyNoticeUrl('https://shorevest.com.evil.example/privacy-policy/'), false);
  assert.equal(validPrivacyNoticeUrl('https://shorevest.com/other-page/'), false);
});

test('valid external delivery configuration accepts only the approved sender and privacy URL', () => {
  const config = loadConfig(deliveryEnvironment());
  assert.deepEqual(validateConfig(config), { ok: true, missing: [], invalid: [] });
});

test('external delivery fails closed for off-domain or injected mailbox values', () => {
  for (const mailbox of [
    'recruitment@example.com',
    'Recruitment <recruitment@shorevest.com>',
    'recruitment@shorevest.com\nBcc: attacker@example.com'
  ]) {
    const shape = validateConfig(loadConfig(deliveryEnvironment({
      RECRUITMENT_CANDIDATE_ACK_MAILBOX: mailbox
    })));
    assert.ok(shape.invalid.includes('candidateAcknowledgement.mailbox'));
  }
});

test('external delivery fails closed for off-domain or mutable privacy links', () => {
  for (const privacyNoticeUrl of [
    'https://example.com/privacy-policy/',
    'https://shorevest.com/privacy-policy/?candidate=1',
    'https://shorevest.com/other-page/'
  ]) {
    const shape = validateConfig(loadConfig(deliveryEnvironment({
      RECRUITMENT_CANDIDATE_ACK_PRIVACY_URL: privacyNoticeUrl
    })));
    assert.ok(shape.invalid.includes('candidateAcknowledgement.privacyNoticeUrl'));
  }
});
