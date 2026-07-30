'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const root = path.resolve(__dirname, '../../..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/recruitment-functions.yml'),
  'utf8'
);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const rootBicepTemplates = [
  'infra/recruitment/main.bicep',
  'infra/recruitment/candidate-upload-cors.bicep',
  'infra/recruitment/event-grid-subscription.bicep',
  'infra/recruitment/hr-auth.bicep',
  'infra/recruitment/monitoring-rules.v4.bicep',
  'infra/recruitment/runtime-settings.v2.bicep',
  'infra/recruitment/upload-cors.bicep'
];

test('root package exposes authoritative recruitment Bicep build and lint scripts', () => {
  const build = packageJson.scripts['bicep:build:recruitment'];
  const lint = packageJson.scripts['bicep:lint:recruitment'];
  assert.equal(typeof build, 'string');
  assert.equal(typeof lint, 'string');
  for (const template of rootBicepTemplates) {
    assert.ok(build.includes(`--file ${template}`), `build script omits ${template}`);
  }
  for (const template of rootBicepTemplates) {
    assert.ok(!lint.includes(`--file ${template}`), `lint script still references ${template}`);
  }
});

test('GitHub Actions delegates Bicep validation to authoritative root scripts', () => {
  assert.ok(workflow.includes('run: npm run bicep:build:recruitment'));
  assert.ok(workflow.includes('run: npm run bicep:lint:recruitment'));
  assert.ok(!workflow.includes('az bicep build --file infra/recruitment/main.bicep'));
});

test('recruitment CI executes and verifies the immutable Function package', () => {
  assert.ok(workflow.includes('Build and verify immutable Function package'));
  assert.ok(workflow.includes('services/recruitment-functions/scripts/package.ps1'));
  assert.ok(workflow.includes("'deployment-metadata.json'"));
  assert.ok(workflow.includes("'services/recruitment-functions/node_modules/@azure/functions/package.json'"));
  assert.ok(workflow.includes("'services/recruitment-functions/src/functions/index.js'"));
  assert.ok(workflow.includes('Archive digest sidecar does not match the generated ZIP.'));
});

test('recruitment CI still runs application, security, function and whitespace validation', () => {
  for (const command of [
    'npm run validate:recruitment',
    'npm run check:recruitment',
    'npm run test:recruitment',
    'npm run check:security',
    'npm run check:functions',
    'npm run test:functions',
    'git diff --check'
  ]) {
    assert.ok(workflow.includes(`run: ${command}`), `workflow omits ${command}`);
  }
});
