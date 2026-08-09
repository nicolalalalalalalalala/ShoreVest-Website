'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadConfig, validateConfig } = require('../src/lib/config');

function captureEnvironment(patch = {}) {
  return {
    RECRUITMENT_API_ENABLED: 'true',
    RECRUITMENT_CAPTURE_ONLY_MODE: 'true',
    RECRUITMENT_ENVIRONMENT: 'production',
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com,https://www.shorevest.com',
    RECRUITMENT_MANAGED_IDENTITY_CLIENT_ID: '00000000-0000-0000-0000-000000000001',
    RECRUITMENT_COSMOS_ENDPOINT: 'https://example.documents.azure.com',
    RECRUITMENT_COSMOS_DATABASE: 'recruitment',
    RECRUITMENT_STORAGE_ACCOUNT_URL: 'https://example.blob.core.windows.net',
    RECRUITMENT_KEYVAULT_URL: 'https://example.vault.azure.net',
    RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME: 'completion',
    RECRUITMENT_FINGERPRINT_SECRET_NAME: 'fingerprint',
    RECRUITMENT_RATE_LIMIT_ENABLED: 'true',
    RECRUITMENT_BOT_VERIFICATION_MODE: 'turnstile',
    RECRUITMENT_BOT_VERIFICATION_SECRET_NAME: 'turnstile',
    RECRUITMENT_BOT_VERIFICATION_HOSTNAME: 'shorevest.com,www.shorevest.com',
    RECRUITMENT_BOT_VERIFICATION_ACTION: 'recruitment-application',
    RECRUITMENT_OUTBOX_DELIVERY_ENABLED: 'false',
    RECRUITMENT_CANDIDATE_ACK_ENABLED: 'false',
    RECRUITMENT_CANDIDATE_ACK_TEMPLATE_APPROVED: 'false',
    RECRUITMENT_TEAM_NOTIFICATION_ENABLED: 'false',
    RECRUITMENT_PLATFORM_AUTH_ENABLED: 'false',
    RECRUITMENT_HR_ACCESS_ENABLED: 'false',
    RECRUITMENT_RETENTION_ENABLED: 'false',
    RECRUITMENT_RETENTION_DELETION_ENABLED: 'false',
    ...patch
  };
}

test('capture-only mode allows the public API with delivery, HR and retention disabled', () => {
  const config = loadConfig(captureEnvironment());
  assert.equal(config.captureOnly, true);
  assert.deepEqual(validateConfig(config), { ok: true, missing: [], invalid: [] });
});

test('capture-only mode allows non-destructive candidate and Careers mailbox notifications', () => {
  const config = loadConfig(captureEnvironment({
    RECRUITMENT_OUTBOX_DELIVERY_ENABLED: 'true',
    RECRUITMENT_SHAREPOINT_SITE_ID: 'site-id',
    RECRUITMENT_APPLICATIONS_LIST_ID: 'applications-list',
    RECRUITMENT_FILES_LIST_ID: 'files-list',
    RECRUITMENT_CANDIDATE_ACK_ENABLED: 'true',
    RECRUITMENT_CANDIDATE_ACK_TEMPLATE_APPROVED: 'true',
    RECRUITMENT_CANDIDATE_ACK_MAILBOX: 'careers@shorevest.com',
    RECRUITMENT_CANDIDATE_ACK_PRIVACY_URL: 'https://shorevest.com/privacy-policy/',
    RECRUITMENT_TEAM_NOTIFICATION_ENABLED: 'true',
    RECRUITMENT_TEAM_NOTIFICATION_MAILBOX: 'careers@shorevest.com'
  }));
  assert.equal(config.captureOnly, true);
  assert.deepEqual(validateConfig(config), { ok: true, missing: [], invalid: [] });
});

test('capture-only mode allows authenticated read-only HR document access', () => {
  const config = loadConfig(captureEnvironment({
    RECRUITMENT_PLATFORM_AUTH_ENABLED: 'true',
    RECRUITMENT_HR_ACCESS_ENABLED: 'true',
    RECRUITMENT_HR_REQUIRED_ROLE: 'Recruitment.HR',
    RECRUITMENT_HR_READ_SAS_SECONDS: '300'
  }));
  assert.equal(config.captureOnly, true);
  assert.equal(config.hrAccess.enabled, true);
  assert.deepEqual(validateConfig(config), { ok: true, missing: [], invalid: [] });
});

test('capture-only HR access still fails closed without platform authentication', () => {
  const shape = validateConfig(loadConfig(captureEnvironment({
    RECRUITMENT_HR_ACCESS_ENABLED: 'true'
  })));
  assert.equal(shape.ok, false);
  assert.ok(shape.invalid.includes('hrAccess.platformAuthenticationEnabled'));
});

test('capture-only mode still fails closed for retention or deletion', () => {
  for (const [setting, expected] of [
    ['RECRUITMENT_RETENTION_ENABLED', 'retention.enabled'],
    ['RECRUITMENT_RETENTION_DELETION_ENABLED', 'retention.deletionEnabled']
  ]) {
    const shape = validateConfig(loadConfig(captureEnvironment({ [setting]: 'true' })));
    assert.equal(shape.ok, false, `${setting} must invalidate capture-only mode`);
    assert.ok(shape.invalid.includes(expected), `${expected} must be reported`);
  }
});

test('normal enabled API still requires the full downstream launch controls', () => {
  const shape = validateConfig(loadConfig(captureEnvironment({
    RECRUITMENT_CAPTURE_ONLY_MODE: 'false'
  })));
  assert.equal(shape.ok, false);
  assert.ok(shape.invalid.includes('outboxDelivery.enabled'));
  assert.ok(shape.invalid.includes('hrAccess.enabled'));
  assert.ok(shape.invalid.includes('retention.enabled'));
  assert.ok(shape.invalid.includes('retention.deletionEnabled'));
});