'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const template = fs.readFileSync(
  path.join(root, 'infra/recruitment/runtime-settings.v2.bicep'),
  'utf8'
);
const configSource = fs.readFileSync(
  path.join(root, 'services/recruitment-functions/src/lib/config.js'),
  'utf8'
);

const requiredHostSettings = [
  'FUNCTIONS_WORKER_RUNTIME',
  'AzureWebJobsStorage__accountName',
  'AzureWebJobsStorage__credential',
  'AzureWebJobsStorage__clientId',
  'AZURE_CLIENT_ID',
  'APPLICATIONINSIGHTS_CONNECTION_STRING'
];

const requiredRecruitmentSettings = [
  'RECRUITMENT_MANAGED_IDENTITY_CLIENT_ID',
  'RECRUITMENT_API_ENABLED',
  'RECRUITMENT_ENVIRONMENT',
  'RECRUITMENT_ALLOWED_ORIGINS',
  'RECRUITMENT_REQUIRE_ORIGIN',
  'RECRUITMENT_MAX_BODY_BYTES',
  'RECRUITMENT_COSMOS_ENDPOINT',
  'RECRUITMENT_COSMOS_DATABASE',
  'RECRUITMENT_STORAGE_ACCOUNT_URL',
  'RECRUITMENT_UPLOAD_STORAGE_ACCOUNT_NAME',
  'RECRUITMENT_QUARANTINE_CONTAINER',
  'RECRUITMENT_CLEAN_CONTAINER',
  'RECRUITMENT_KEYVAULT_URL',
  'RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME',
  'RECRUITMENT_FINGERPRINT_SECRET_NAME',
  'RECRUITMENT_RATE_LIMIT_ENABLED',
  'RECRUITMENT_RATE_LIMIT_COUNT',
  'RECRUITMENT_RATE_LIMIT_WINDOW_SECONDS',
  'RECRUITMENT_BOT_VERIFICATION_MODE',
  'RECRUITMENT_BOT_VERIFICATION_SECRET_NAME',
  'RECRUITMENT_BOT_VERIFICATION_HOSTNAME',
  'RECRUITMENT_BOT_VERIFICATION_ACTION',
  'RECRUITMENT_BOT_VERIFICATION_ENDPOINT',
  'RECRUITMENT_OUTBOX_DELIVERY_ENABLED',
  'RECRUITMENT_OUTBOX_LEASE_SECONDS',
  'RECRUITMENT_OUTBOX_RETRY_SECONDS',
  'RECRUITMENT_OUTBOX_MAX_ATTEMPTS',
  'RECRUITMENT_GRAPH_ENDPOINT',
  'RECRUITMENT_SHAREPOINT_SITE_ID',
  'RECRUITMENT_APPLICATIONS_LIST_ID',
  'RECRUITMENT_FILES_LIST_ID',
  'RECRUITMENT_CANDIDATE_ACK_ENABLED',
  'RECRUITMENT_CANDIDATE_ACK_TEMPLATE_APPROVED',
  'RECRUITMENT_CANDIDATE_ACK_MAILBOX',
  'RECRUITMENT_CANDIDATE_ACK_PRIVACY_URL',
  'RECRUITMENT_PLATFORM_AUTH_ENABLED',
  'RECRUITMENT_HR_ACCESS_ENABLED',
  'RECRUITMENT_HR_REQUIRED_ROLE',
  'RECRUITMENT_HR_READ_SAS_SECONDS',
  'RECRUITMENT_RETENTION_ENABLED',
  'RECRUITMENT_RETENTION_DELETION_ENABLED',
  'RECRUITMENT_RETENTION_POLICY_VERSION',
  'RECRUITMENT_RETENTION_ADMIN_ROLE',
  'RECRUITMENT_RETENTION_INCOMPLETE_HOURS',
  'RECRUITMENT_RETENTION_SUBMITTED_DAYS',
  'RECRUITMENT_RETENTION_MALICIOUS_DAYS',
  'RECRUITMENT_RETENTION_BATCH_SIZE',
  'RECRUITMENT_RETENTION_LEASE_SECONDS',
  'RECRUITMENT_RETENTION_RETRY_SECONDS'
];

test('runtime settings v2 preserves every Functions host identity setting', () => {
  for (const setting of requiredHostSettings) {
    assert.ok(template.includes(setting), `${setting} is missing from runtime settings v2`);
  }
  assert.ok(template.includes("AzureWebJobsStorage__credential: 'managedidentity'"));
  assert.ok(template.includes('AzureWebJobsStorage__clientId: identity.properties.clientId'));
  assert.ok(template.includes('AZURE_CLIENT_ID: identity.properties.clientId'));
  assert.ok(!template.includes('FUNCTIONS_EXTENSION_VERSION'));
});

test('runtime settings v2 contains the complete recruitment configuration surface', () => {
  for (const setting of requiredRecruitmentSettings) {
    assert.ok(template.includes(setting), `${setting} is missing from runtime settings v2`);
    assert.ok(configSource.includes(setting), `${setting} is not consumed by runtime config`);
  }
});

test('all public external and destructive capabilities default off', () => {
  for (const parameter of [
    'enableApi',
    'enableOutboxDelivery',
    'enableCandidateAcknowledgement',
    'candidateAcknowledgementTemplateApproved',
    'enableHrAccess',
    'platformAuthenticationEnabled',
    'enableRetention',
    'enableRetentionDeletion'
  ]) {
    assert.ok(template.includes(`param ${parameter} bool = false`), `${parameter} must default false`);
  }
});

test('runtime settings v2 references resources by name and contains no tenant-specific identifiers', () => {
  assert.ok(template.includes("resource fn 'Microsoft.Web/sites@2024-04-01' existing"));
  assert.ok(template.includes("resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing"));
  assert.ok(template.includes("resource hostStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing"));
  assert.ok(!template.includes('/subscriptions/'));
  assert.ok(!template.includes('/tenants/'));
  assert.ok(!template.includes('@shorevest.com'));
  assert.ok(!template.includes('clientSecret'));
  assert.ok(!template.includes('accountKey'));
});

test('runtime settings v2 keeps exact ShoreVest origins, Turnstile constraints and role names', () => {
  assert.ok(template.includes("RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com,https://www.shorevest.com'"));
  assert.ok(template.includes("param botVerificationHostnames string = 'shorevest.com,www.shorevest.com'"));
  assert.ok(template.includes("param botVerificationAction string = 'recruitment-application'"));
  assert.ok(template.includes('RECRUITMENT_BOT_VERIFICATION_HOSTNAME: botVerificationHostnames'));
  assert.ok(template.includes('RECRUITMENT_BOT_VERIFICATION_ACTION: botVerificationAction'));
  assert.ok(template.includes("RECRUITMENT_HR_REQUIRED_ROLE: 'Recruitment.HR'"));
  assert.ok(template.includes("RECRUITMENT_RETENTION_ADMIN_ROLE: 'Recruitment.RetentionAdmin'"));
  assert.ok(template.includes("RECRUITMENT_HR_READ_SAS_SECONDS: '300'"));
});

test('runtime settings v2 cannot silently fall back to the single apex hostname', () => {
  assert.ok(!template.includes("param botVerificationHostname string = 'shorevest.com'"));
  assert.doesNotMatch(
    template,
    /RECRUITMENT_BOT_VERIFICATION_HOSTNAME:\s*botVerificationHostname\b/,
    'the runtime setting must reference the plural approved-hostname set'
  );
  assert.ok(template.includes('RECRUITMENT_BOT_VERIFICATION_ACTION'));
});
