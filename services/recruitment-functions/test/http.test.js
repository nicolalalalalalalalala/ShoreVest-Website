'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadConfig, validateConfig } = require('../src/lib/config');
const {
  originAllowed,
  readJson,
  normalizeAppServiceClientIp,
  requestContext,
  candidate,
  unavailable
} = require('../src/lib/http');

function req({
  origin = 'https://shorevest.com',
  contentType = 'application/json',
  body = '{}',
  clientIp = '',
  clientIpWithPort = '',
  forwardedFor = '',
  cloudflareIp = '',
  userAgent = ''
} = {}) {
  const values = {
    origin,
    'content-type': contentType,
    'x-client-ip': clientIp,
    'client-ip': clientIpWithPort,
    'x-forwarded-for': forwardedFor,
    'cf-connecting-ip': cloudflareIp,
    'user-agent': userAgent
  };
  return {
    headers: { get: (key) => values[key.toLowerCase()] || null },
    text: async () => body,
    method: 'POST'
  };
}

test('API disabled response performs no durable work', () => {
  const config = loadConfig({
    RECRUITMENT_API_ENABLED: 'false',
    RECRUITMENT_ENVIRONMENT: 'local',
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com'
  });
  const result = unavailable(req(), config);
  assert.equal(result.status, 503);
});

test('production requests require an approved Origin header', () => {
  const config = loadConfig({
    RECRUITMENT_ENVIRONMENT: 'production',
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com'
  });
  assert.equal(originAllowed(req({ origin: '' }), config), false);
  assert.equal(originAllowed(req({ origin: 'https://evil.example' }), config), false);
  assert.equal(originAllowed(req(), config), true);
});

test('origin and content validation', async () => {
  const config = loadConfig({
    RECRUITMENT_API_ENABLED: 'true',
    RECRUITMENT_ENVIRONMENT: 'local',
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com',
    RECRUITMENT_MAX_BODY_BYTES: '10'
  });
  assert.equal(originAllowed(req({ origin: 'https://evil.example' }), config), false);
  assert.equal((await readJson(req({ contentType: 'multipart/form-data' }), config)).error.status, 415);
  assert.equal((await readJson(req({ body: 'x'.repeat(11) }), config)).error.status, 413);
});

test('request context trusts App Service client IP headers and ignores spoofable proxy headers', () => {
  const context = requestContext(req({
    clientIp: '203.0.113.10',
    forwardedFor: '198.51.100.1, 10.0.0.1',
    cloudflareIp: '192.0.2.1',
    userAgent: 'x'.repeat(600)
  }));
  assert.equal(context.clientIp, '203.0.113.10');
  assert.equal(context.userAgent.length, 512);

  const missingPlatformIp = requestContext(req({
    forwardedFor: '198.51.100.1',
    cloudflareIp: '192.0.2.1'
  }));
  assert.equal(missingPlatformIp.clientIp, '');
});

test('App Service client IP normalization accepts valid addresses and strips only a bounded port', () => {
  assert.equal(normalizeAppServiceClientIp('203.0.113.10'), '203.0.113.10');
  assert.equal(normalizeAppServiceClientIp('203.0.113.10:443'), '203.0.113.10');
  assert.equal(normalizeAppServiceClientIp('2001:db8::1'), '2001:db8::1');
  assert.equal(normalizeAppServiceClientIp('[2001:db8::1]:443'), '2001:db8::1');
  assert.equal(normalizeAppServiceClientIp('not-an-ip'), '');
  assert.equal(normalizeAppServiceClientIp('203.0.113.10:999999'), '');
});

test('candidate response sanitizes internal fields', () => {
  const output = candidate({
    success: true,
    applicationReference: 'a',
    fileReference: 'f',
    quarantineBlobPath: 'secret',
    cleanBlobPath: 'secret2',
    aggregateVersion: 3,
    upload: {
      url: 'https://acct.blob.core.windows.net/c/b?sas',
      method: 'PUT',
      requiredHeaders: {}
    }
  });
  assert.equal(output.quarantineBlobPath, undefined);
  assert.equal(output.aggregateVersion, undefined);
  assert.ok(output.upload.url);
});

test('enabled production API fails configuration validation without launch controls', () => {
  const config = loadConfig({
    RECRUITMENT_API_ENABLED: 'true',
    RECRUITMENT_ENVIRONMENT: 'production',
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com',
    RECRUITMENT_COSMOS_ENDPOINT: 'https://example.documents.azure.com',
    RECRUITMENT_COSMOS_DATABASE: 'recruitment',
    RECRUITMENT_STORAGE_ACCOUNT_URL: 'https://example.blob.core.windows.net',
    RECRUITMENT_KEYVAULT_URL: 'https://example.vault.azure.net',
    RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME: 'completion',
    RECRUITMENT_FINGERPRINT_SECRET_NAME: 'fingerprint'
  });
  const shape = validateConfig(config);
  assert.equal(shape.ok, false);
  assert.ok(shape.missing.includes('managedIdentityClientId'));
  assert.ok(shape.invalid.includes('rateLimit.enabled'));
  assert.ok(shape.invalid.includes('botVerification.mode'));
  assert.ok(shape.invalid.includes('outboxDelivery.enabled'));
  assert.ok(shape.invalid.includes('hrAccess.enabled'));
  assert.ok(shape.invalid.includes('retention.enabled'));
  assert.ok(shape.invalid.includes('retention.deletionEnabled'));
});

test('enabled delivery fails without SharePoint, mailbox and template approval', () => {
  const config = loadConfig({
    RECRUITMENT_ENVIRONMENT: 'production',
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com',
    RECRUITMENT_MANAGED_IDENTITY_CLIENT_ID: '00000000-0000-0000-0000-000000000001',
    RECRUITMENT_COSMOS_ENDPOINT: 'https://example.documents.azure.com',
    RECRUITMENT_COSMOS_DATABASE: 'recruitment',
    RECRUITMENT_STORAGE_ACCOUNT_URL: 'https://example.blob.core.windows.net',
    RECRUITMENT_KEYVAULT_URL: 'https://example.vault.azure.net',
    RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME: 'completion',
    RECRUITMENT_FINGERPRINT_SECRET_NAME: 'fingerprint',
    RECRUITMENT_OUTBOX_DELIVERY_ENABLED: 'true'
  });
  const shape = validateConfig(config);
  assert.ok(shape.missing.includes('sharePoint.siteId'));
  assert.ok(shape.missing.includes('sharePoint.applicationsListId'));
  assert.ok(shape.missing.includes('sharePoint.filesListId'));
  assert.ok(shape.missing.includes('candidateAcknowledgement.mailbox'));
  assert.ok(shape.invalid.includes('candidateAcknowledgement.enabled'));
  assert.ok(shape.invalid.includes('candidateAcknowledgement.templateApproved'));
});

test('HR access fails closed without platform authentication or a bounded SAS duration', () => {
  const config = loadConfig({
    RECRUITMENT_ENVIRONMENT: 'production',
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com',
    RECRUITMENT_COSMOS_ENDPOINT: 'https://example.documents.azure.com',
    RECRUITMENT_COSMOS_DATABASE: 'recruitment',
    RECRUITMENT_STORAGE_ACCOUNT_URL: 'https://example.blob.core.windows.net',
    RECRUITMENT_KEYVAULT_URL: 'https://example.vault.azure.net',
    RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME: 'completion',
    RECRUITMENT_FINGERPRINT_SECRET_NAME: 'fingerprint',
    RECRUITMENT_HR_ACCESS_ENABLED: 'true',
    RECRUITMENT_HR_READ_SAS_SECONDS: '301'
  });
  const shape = validateConfig(config);
  assert.ok(shape.invalid.includes('hrAccess.platformAuthenticationEnabled'));
  assert.ok(shape.invalid.includes('hrAccess.readSasSeconds'));
});

test('retention fails closed without authentication, policy version or delivery', () => {
  const config = loadConfig({
    RECRUITMENT_ENVIRONMENT: 'production',
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com',
    RECRUITMENT_COSMOS_ENDPOINT: 'https://example.documents.azure.com',
    RECRUITMENT_COSMOS_DATABASE: 'recruitment',
    RECRUITMENT_STORAGE_ACCOUNT_URL: 'https://example.blob.core.windows.net',
    RECRUITMENT_KEYVAULT_URL: 'https://example.vault.azure.net',
    RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME: 'completion',
    RECRUITMENT_FINGERPRINT_SECRET_NAME: 'fingerprint',
    RECRUITMENT_RETENTION_ENABLED: 'true',
    RECRUITMENT_RETENTION_DELETION_ENABLED: 'true'
  });
  const shape = validateConfig(config);
  assert.ok(shape.invalid.includes('retention.platformAuthenticationEnabled'));
  assert.ok(shape.missing.includes('retention.policyVersion'));
  assert.ok(shape.invalid.includes('outboxDelivery.enabled'));
});

test('enabled production API validates only when all launch controls are configured', () => {
  const config = loadConfig({
    RECRUITMENT_API_ENABLED: 'true',
    RECRUITMENT_ENVIRONMENT: 'production',
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com',
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
    RECRUITMENT_CANDIDATE_ACK_PRIVACY_URL: 'https://shorevest.com/privacy-policy/',
    RECRUITMENT_HR_ACCESS_ENABLED: 'true',
    RECRUITMENT_PLATFORM_AUTH_ENABLED: 'true',
    RECRUITMENT_HR_REQUIRED_ROLE: 'Recruitment.HR',
    RECRUITMENT_HR_READ_SAS_SECONDS: '300',
    RECRUITMENT_RETENTION_ENABLED: 'true',
    RECRUITMENT_RETENTION_DELETION_ENABLED: 'true',
    RECRUITMENT_RETENTION_POLICY_VERSION: 'retention-v1',
    RECRUITMENT_RETENTION_ADMIN_ROLE: 'Recruitment.RetentionAdmin',
    RECRUITMENT_RETENTION_INCOMPLETE_HOURS: '48',
    RECRUITMENT_RETENTION_SUBMITTED_DAYS: '365',
    RECRUITMENT_RETENTION_MALICIOUS_DAYS: '30',
    RECRUITMENT_RETENTION_BATCH_SIZE: '10',
    RECRUITMENT_RETENTION_LEASE_SECONDS: '300',
    RECRUITMENT_RETENTION_RETRY_SECONDS: '900'
  });
  assert.deepEqual(validateConfig(config), { ok: true, missing: [], invalid: [] });
});
