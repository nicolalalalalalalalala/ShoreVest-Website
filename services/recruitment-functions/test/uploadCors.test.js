'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(
  path.join(root, 'infra/recruitment/upload-cors.bicep'),
  'utf8'
);

function arrayBlock(property) {
  const start = source.indexOf(`${property}: [`);
  assert.notEqual(start, -1, `${property} is missing`);
  const end = source.indexOf('\n          ]', start);
  assert.notEqual(end, -1, `${property} array is not closed`);
  return source.slice(start, end);
}

test('upload CORS defaults to exact ShoreVest origins only', () => {
  assert.ok(source.includes("'https://shorevest.com'"));
  assert.ok(source.includes("'https://www.shorevest.com'"));
  assert.ok(!source.includes("'*'"));
  assert.ok(!source.includes('localhost'));
  assert.ok(!source.includes('github.io'));
});

test('upload CORS permits only PUT and OPTIONS', () => {
  const methods = arrayBlock('allowedMethods');
  assert.ok(methods.includes("'PUT'"));
  assert.ok(methods.includes("'OPTIONS'"));
  for (const forbidden of ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'MERGE']) {
    assert.ok(!methods.includes(`'${forbidden}'`), `${forbidden} must not be allowed`);
  }
});

test('upload CORS uses a narrow request-header allowlist', () => {
  const headers = arrayBlock('allowedHeaders');
  for (const required of ['content-type', 'x-ms-blob-type', 'x-ms-client-request-id']) {
    assert.ok(headers.includes(`'${required}'`), `${required} is required`);
  }
  assert.ok(!headers.includes('*'));
  assert.ok(!headers.includes('authorization'));
  assert.ok(!headers.includes('cookie'));
});

test('upload CORS exposes only operational response headers', () => {
  const headers = arrayBlock('exposedHeaders');
  assert.ok(headers.includes("'etag'"));
  assert.ok(headers.includes("'x-ms-request-id'"));
  assert.ok(!headers.includes('*'));
  assert.ok(!headers.toLowerCase().includes('server'));
});

test('preflight cache is bounded and the template targets an existing account', () => {
  assert.ok(source.includes('@maxValue(3600)'));
  assert.ok(source.includes('param maxAgeInSeconds int = 600'));
  assert.ok(source.includes("resource cvStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing"));
  assert.ok(source.includes("name: 'default'"));
});
