'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const root = path.resolve(__dirname, '../../..');
const contract = fs.readFileSync(
  path.join(root, 'docs/recruitment/DEPLOYMENT_CONTRACT.md'),
  'utf8'
);
const authTemplate = fs.readFileSync(
  path.join(root, 'infra/recruitment/hr-auth.bicep'),
  'utf8'
);

test('deployment contract invokes the PowerShell 7 packaging script', () => {
  assert.ok(contract.includes('pwsh -NoProfile -File services/recruitment-functions/scripts/package.ps1'));
  assert.ok(!contract.includes('powershell -ExecutionPolicy Bypass -File services/recruitment-functions/scripts/package.ps1'));
});

test('Easy Auth deployment command uses parameters declared by hr-auth.bicep', () => {
  assert.ok(authTemplate.includes('param functionAppName string'));
  assert.ok(authTemplate.includes('param entraClientId string'));
  assert.ok(authTemplate.includes('param openIdIssuer string'));
  assert.ok(contract.includes('openIdIssuer=<tenant-specific-openid-issuer>'));
  assert.ok(!contract.includes('tenantId=<tenant-id>'));
  assert.ok(!contract.includes('appRegistrationIssuer=<issuer-url>'));
});
