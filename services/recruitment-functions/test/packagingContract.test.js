'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const root = path.resolve(__dirname, '../../..');
const packagingScriptPath = path.join(
  root,
  'services/recruitment-functions/scripts/package.ps1'
);
const source = fs.readFileSync(packagingScriptPath, 'utf8');

test('immutable recruitment packaging script exists and uses the lockfile', () => {
  assert.equal(fs.existsSync(packagingScriptPath), true);
  assert.ok(source.includes("Join-Path $serviceRoot 'package-lock.json'"));
  assert.ok(source.includes("-Command 'npm'"));
  assert.ok(source.includes("@('ci', '--omit=dev', '--no-audit', '--no-fund')"));
});

test('package preserves repository-relative Function and shared-core paths', () => {
  for (const required of [
    "$serviceStagingRoot = Join-Path $stagingRoot 'services/recruitment-functions'",
    "'services/recruitment-functions/src/functions/index.js'",
    "Join-Path $serviceStagingRoot 'src'",
    "Join-Path $serviceStagingRoot 'node_modules'",
    "Join-Path $repoRoot 'api/recruitment/core'",
    "Join-Path $stagingRoot 'api/recruitment/core'",
    "Join-Path $repoRoot 'assets/data/recruitment'"
  ]) {
    assert.ok(source.includes(required), `packaging script omits ${required}`);
  }
  assert.ok(source.includes("Copy-Item -Path (Join-Path $Source '*')"));
  assert.ok(!source.includes("Copy-Item -LiteralPath (Join-Path $Source '*')"));
});

test('package smoke-loads modules that depend on repository-relative imports', () => {
  assert.ok(source.includes("require('./services/recruitment-functions/src/appFactory.js')"));
  assert.ok(source.includes("require('./services/recruitment-functions/src/lib/eventGrid.js')"));
});

test('package rejects secrets and writes verifiable deployment metadata', () => {
  for (const required of [
    'local.settings*',
    '.env*',
    "'.pem'",
    "'.key'",
    "'.pfx'",
    'deployment-metadata.json',
    'sourceCommit',
    'packagedAtUtc',
    'payloadSha256',
    'payloadSha256Scope',
    'archiveSha256Sidecar',
    'Compress-Archive',
    'Get-FileHash -LiteralPath $outputFullPath -Algorithm SHA256'
  ]) {
    assert.ok(source.includes(required), `packaging script omits ${required}`);
  }
});
