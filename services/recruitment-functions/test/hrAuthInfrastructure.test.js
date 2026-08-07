'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const template = fs.readFileSync(
  path.resolve(__dirname, '../../../infra/recruitment/hr-auth.bicep'),
  'utf8'
);

test('Easy Auth is enabled while public candidate endpoints remain anonymous', () => {
  assert.ok(template.includes("name: 'authsettingsV2'"));
  assert.ok(template.includes('enabled: true'));
  assert.ok(template.includes('requireAuthentication: false'));
  assert.ok(template.includes("unauthenticatedClientAction: 'AllowAnonymous'"));
});

test('Easy Auth validates tenant-specific Entra tokens and HTTPS', () => {
  assert.ok(template.includes('azureActiveDirectory'));
  assert.ok(template.includes('openIdIssuer: openIdIssuer'));
  assert.ok(template.includes('allowedAudiences: allowedAudiences'));
  assert.ok(template.includes('requireHttps: true'));
});

test('token store is disabled and HR authorization remains server-side', () => {
  assert.ok(template.includes('tokenStore:'));
  assert.ok(template.includes('enabled: false'));
  assert.ok(template.includes('Recruitment.HR'));
});
