'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const root = path.resolve(__dirname, '../../..');
const runtimeSettings = fs.readFileSync(
  path.join(root, 'infra/recruitment/runtime-settings.v2.bicep'),
  'utf8'
);
const localSettings = JSON.parse(fs.readFileSync(
  path.join(root, 'services/recruitment-functions/local.settings.example.json'),
  'utf8'
));

test('authoritative runtime settings bind host and application ceilings to one parameter', () => {
  assert.ok(runtimeSettings.includes('param maxBodyBytes int = 65536'));
  assert.ok(runtimeSettings.includes('FUNCTIONS_REQUEST_BODY_SIZE_LIMIT: string(maxBodyBytes)'));
  assert.ok(runtimeSettings.includes('RECRUITMENT_MAX_BODY_BYTES: string(maxBodyBytes)'));
  assert.equal(
    (runtimeSettings.match(/string\(maxBodyBytes\)/g) || []).length,
    2,
    'host and application limits must be the only maxBodyBytes consumers'
  );
});

test('local example keeps the Functions host and application limits identical', () => {
  const values = localSettings.Values;
  assert.equal(values.FUNCTIONS_REQUEST_BODY_SIZE_LIMIT, '65536');
  assert.equal(values.RECRUITMENT_MAX_BODY_BYTES, '65536');
  assert.equal(values.FUNCTIONS_REQUEST_BODY_SIZE_LIMIT, values.RECRUITMENT_MAX_BODY_BYTES);
});

test('public API remains disabled while the host ceiling is configured', () => {
  assert.equal(localSettings.Values.RECRUITMENT_API_ENABLED, 'false');
  assert.ok(runtimeSettings.includes('param enableApi bool = false'));
});
