'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const repositoryRoot = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

test('base recruitment infrastructure remains disabled by default', () => {
  const source = read('infra/recruitment/main.bicep');
  assert.match(source, /name:\s*'RECRUITMENT_API_ENABLED'\s*\n\s*value:\s*'false'/);
  assert.match(source, /param enableDefenderForStorage bool = false/);
  assert.doesNotMatch(source, /name:\s*'RECRUITMENT_API_ENABLED'\s*\n\s*value:\s*'true'/);
});

test('authoritative runtime settings v2 deploy exact Turnstile hostname and action constraints', () => {
  const source = read('infra/recruitment/runtime-settings.v2.bicep');
  assert.match(
    source,
    /param botVerificationHostnames string = 'shorevest\.com,www\.shorevest\.com'/
  );
  assert.match(
    source,
    /param botVerificationAction string = 'recruitment-application'/
  );
  assert.match(
    source,
    /RECRUITMENT_BOT_VERIFICATION_HOSTNAME:\s*botVerificationHostnames/
  );
  assert.match(
    source,
    /RECRUITMENT_BOT_VERIFICATION_ACTION:\s*botVerificationAction/
  );
});

test('authoritative runtime settings v2 keep every external and destructive capability off by default', () => {
  const source = read('infra/recruitment/runtime-settings.v2.bicep');
  for (const declaration of [
    'param enableApi bool = false',
    'param enableOutboxDelivery bool = false',
    'param enableCandidateAcknowledgement bool = false',
    'param candidateAcknowledgementTemplateApproved bool = false',
    'param enableHrAccess bool = false',
    'param platformAuthenticationEnabled bool = false',
    'param enableRetention bool = false',
    'param enableRetentionDeletion bool = false'
  ]) {
    assert.ok(source.includes(declaration), `missing safe default: ${declaration}`);
  }
});

test('local example documents the same Turnstile action without enabling the API', () => {
  const settings = JSON.parse(read('services/recruitment-functions/local.settings.example.json'));
  assert.equal(settings.Values.RECRUITMENT_API_ENABLED, 'false');
  assert.equal(settings.Values.RECRUITMENT_BOT_VERIFICATION_ACTION, 'recruitment-application');
  assert.equal(settings.Values.RECRUITMENT_BOT_VERIFICATION_MODE, 'disabled');
});
