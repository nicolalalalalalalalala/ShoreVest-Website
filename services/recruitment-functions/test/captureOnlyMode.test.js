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

test('capture-only mode fails closed if any downstream capability is enabled', () => {
  for (const [setting, expected] of [
    ['RECRUITMENT_OUTBOX_DELIVERY_ENABLED', 'outboxDelivery.enabled'],
    ['RECRUITMENT_CANDIDATE_ACK_ENABLED', 'candidateAcknowledgement.enabled'],
    ['RECRUITMENT_HR_ACCESS_ENABLED', 'hrAccess.enabled'],
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
