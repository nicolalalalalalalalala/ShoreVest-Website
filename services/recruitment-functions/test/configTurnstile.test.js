'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  commaList,
  originHostnames,
  sameStringSet,
  loadConfig,
  validateConfig
} = require('../src/lib/config');

function launchEnvironment(patch = {}) {
  return {
    RECRUITMENT_API_ENABLED: 'true',
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
    RECRUITMENT_OUTBOX_DELIVERY_ENABLED: 'true',
    RECRUITMENT_SHAREPOINT_SITE_ID: 'site-id',
    RECRUITMENT_APPLICATIONS_LIST_ID: 'applications-list',
    RECRUITMENT_FILES_LIST_ID: 'files-list',
    RECRUITMENT_CANDIDATE_ACK_ENABLED: 'true',
    RECRUITMENT_CANDIDATE_ACK_TEMPLATE_APPROVED: 'true',
    RECRUITMENT_CANDIDATE_ACK_MAILBOX: 'hr@shorevest.com',
    RECRUITMENT_HR_ACCESS_ENABLED: 'true',
    RECRUITMENT_PLATFORM_AUTH_ENABLED: 'true',
    RECRUITMENT_RETENTION_ENABLED: 'true',
    RECRUITMENT_RETENTION_DELETION_ENABLED: 'true',
    RECRUITMENT_RETENTION_POLICY_VERSION: 'retention-v1',
    ...patch
  };
}

test('comma lists and origin hostnames are normalized deterministically', () => {
  assert.deepEqual(commaList(' a, b, a ,, '), ['a', 'b']);
  assert.deepEqual(originHostnames([
    'https://www.shorevest.com',
    'https://shorevest.com',
    'https://shorevest.com/',
    'http://shorevest.com',
    'https://shorevest.com/path',
    'https://user:password@shorevest.com',
    'not-a-url'
  ]), ['shorevest.com', 'www.shorevest.com']);
  assert.equal(sameStringSet(['b', 'a'], ['a', 'b', 'a']), true);
  assert.equal(sameStringSet(['a'], ['a', 'b']), false);
});

test('production defaults derive exact Turnstile hostnames from approved origins', () => {
  const config = loadConfig(launchEnvironment());
  assert.deepEqual(config.botVerification.expectedHostnames, [
    'shorevest.com',
    'www.shorevest.com'
  ]);
  assert.equal(config.botVerification.expectedAction, 'recruitment-application');
  assert.deepEqual(validateConfig(config), { ok: true, missing: [], invalid: [] });
});

test('explicit Turnstile hostname set may reorder but may not omit or add origins', () => {
  const reordered = loadConfig(launchEnvironment({
    RECRUITMENT_BOT_VERIFICATION_HOSTNAME: 'www.shorevest.com,shorevest.com'
  }));
  assert.equal(validateConfig(reordered).ok, true);

  const missingWww = validateConfig(loadConfig(launchEnvironment({
    RECRUITMENT_BOT_VERIFICATION_HOSTNAME: 'shorevest.com'
  })));
  assert.ok(missingWww.invalid.includes('botVerification.expectedHostnames'));

  const addedLookalike = validateConfig(loadConfig(launchEnvironment({
    RECRUITMENT_BOT_VERIFICATION_HOSTNAME: 'shorevest.com,www.shorevest.com,shorevest.com.attacker.example'
  })));
  assert.ok(addedLookalike.invalid.includes('botVerification.expectedHostnames'));
});

test('Turnstile action is required and bounded to a simple stable identifier', () => {
  for (const action of ['', 'recruitment application', 'x'.repeat(65), 'recruitment/application']) {
    const shape = validateConfig(loadConfig(launchEnvironment({
      RECRUITMENT_BOT_VERIFICATION_ACTION: action
    })));
    if (action === '') {
      // An empty environment value falls back to the safe default.
      assert.equal(shape.ok, true);
    } else {
      assert.ok(shape.invalid.includes('botVerification.expectedAction'));
    }
  }

  const approved = loadConfig(launchEnvironment({
    RECRUITMENT_BOT_VERIFICATION_ACTION: 'recruitment-application-v1'
  }));
  assert.equal(approved.botVerification.expectedAction, 'recruitment-application-v1');
  assert.equal(validateConfig(approved).ok, true);
});

test('manually constructed enabled configs fail without hostname and action constraints', () => {
  const config = loadConfig(launchEnvironment());
  const missingHostnames = {
    ...config,
    botVerification: {
      ...config.botVerification,
      expectedHostnames: []
    }
  };
  assert.ok(validateConfig(missingHostnames).invalid.includes('botVerification.expectedHostnames'));

  const missingAction = {
    ...config,
    botVerification: {
      ...config.botVerification,
      expectedAction: ''
    }
  };
  assert.ok(validateConfig(missingAction).invalid.includes('botVerification.expectedAction'));
});
