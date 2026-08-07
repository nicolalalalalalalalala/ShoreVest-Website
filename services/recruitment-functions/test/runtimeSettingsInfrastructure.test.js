'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const template = fs.readFileSync(
  path.resolve(__dirname, '../../../infra/recruitment/runtime-settings.v2.bicep'),
  'utf8'
);

test('all external recruitment capabilities default disabled in runtime settings v2', () => {
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

test('runtime settings v2 uses managed identity and no storage connection string', () => {
  assert.ok(template.includes("AzureWebJobsStorage__credential: 'managedidentity'"));
  assert.ok(template.includes('AzureWebJobsStorage__clientId: identity.properties.clientId'));
  assert.ok(template.includes('RECRUITMENT_MANAGED_IDENTITY_CLIENT_ID: identity.properties.clientId'));
  assert.ok(!template.includes('AccountKey='));
  assert.ok(!template.includes('SharedAccessSignature='));
});

test('runtime settings v2 centralizes SharePoint, acknowledgement, HR and retention gates', () => {
  for (const setting of [
    'RECRUITMENT_SHAREPOINT_SITE_ID',
    'RECRUITMENT_APPLICATIONS_LIST_ID',
    'RECRUITMENT_FILES_LIST_ID',
    'RECRUITMENT_CANDIDATE_ACK_TEMPLATE_APPROVED',
    'RECRUITMENT_HR_ACCESS_ENABLED',
    'RECRUITMENT_PLATFORM_AUTH_ENABLED',
    'RECRUITMENT_HR_REQUIRED_ROLE',
    'RECRUITMENT_RETENTION_ENABLED',
    'RECRUITMENT_RETENTION_DELETION_ENABLED',
    'RECRUITMENT_RETENTION_POLICY_VERSION',
    'RECRUITMENT_RETENTION_ADMIN_ROLE',
    'RECRUITMENT_RETENTION_INCOMPLETE_HOURS',
    'RECRUITMENT_RETENTION_SUBMITTED_DAYS',
    'RECRUITMENT_RETENTION_MALICIOUS_DAYS'
  ]) {
    assert.ok(template.includes(setting), `${setting} is missing from runtime settings v2`);
  }
});

test('runtime settings v2 preserves identical host and application body ceilings', () => {
  assert.ok(template.includes('FUNCTIONS_REQUEST_BODY_SIZE_LIMIT: string(maxBodyBytes)'));
  assert.ok(template.includes('RECRUITMENT_MAX_BODY_BYTES: string(maxBodyBytes)'));
});
