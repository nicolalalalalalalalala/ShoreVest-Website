'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const template = fs.readFileSync(
  path.resolve(__dirname, '../../../infra/recruitment/main.bicep'),
  'utf8'
);

test('CV storage uses account-scoped Delegator and container-scoped data roles', () => {
  assert.ok(template.includes(
    "var storageBlobDelegatorRoleId = 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a'"
  ));
  assert.ok(template.includes('resource cvStorageBlobDelegator'));
  assert.ok(template.includes('scope: cvStorage'));
  assert.ok(template.includes('storageBlobDelegatorRoleId'));

  assert.ok(template.includes('resource quarantineBlobData'));
  assert.ok(template.includes('scope: quarantine'));
  assert.ok(template.includes('resource cleanBlobData'));
  assert.ok(template.includes('scope: clean'));
});

test('CV storage does not grant account-wide Blob Data Contributor', () => {
  assert.ok(!template.includes('resource cvStorageBlobData'));
  assert.ok(!template.includes("guid(cvStorage.id, mi.id, 'recruitment-blob-data')"));
});

test('Function deployment waits for all required storage role assignments', () => {
  const dependsOn = template.slice(template.indexOf('resource fn '), template.indexOf('// Optional paid Defender'));
  for (const dependency of [
    'deployStorageBlobOwner',
    'cvStorageBlobDelegator',
    'quarantineBlobData',
    'cleanBlobData'
  ]) {
    assert.ok(dependsOn.includes(dependency));
  }
});
