'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/functions/index.js'),
  'utf8'
);

function functionBlock(name) {
  const start = source.indexOf(`app.http('${name}'`);
  assert.notEqual(start, -1, `${name} function registration is missing`);
  const next = source.indexOf("\napp.", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test('initiate endpoint uses the immutable initiation scope and attaches trusted context', () => {
  const block = functionBlock('initiateApplication');
  assert.ok(block.includes('rateLimitScope: RATE_LIMIT_SCOPES.initiate'));
  assert.ok(block.includes('attachRequestContext: true'));
});

test('upload-complete endpoint uses its own immutable scope', () => {
  const block = functionBlock('completeUpload');
  assert.ok(block.includes('rateLimitScope: RATE_LIMIT_SCOPES.complete'));
  assert.ok(!block.includes('RATE_LIMIT_SCOPES.initiate'));
  assert.ok(!block.includes('RATE_LIMIT_SCOPES.finalize'));
});

test('finalization endpoint uses its own immutable scope', () => {
  const block = functionBlock('finalizeApplication');
  assert.ok(block.includes('rateLimitScope: RATE_LIMIT_SCOPES.finalize'));
  assert.ok(!block.includes('RATE_LIMIT_SCOPES.initiate'));
  assert.ok(!block.includes('RATE_LIMIT_SCOPES.complete'));
});

test('public HTTP flow applies rate limiting before request body parsing', () => {
  const flowStart = source.indexOf('async function httpFlow');
  const flowEnd = source.indexOf("\napp.http('initiateApplication'", flowStart);
  const block = source.slice(flowStart, flowEnd);
  const limiter = block.indexOf('applyEndpointRateLimit');
  const bodyRead = block.indexOf('readJson(req, config)');
  assert.ok(limiter > -1);
  assert.ok(bodyRead > -1);
  assert.ok(limiter < bodyRead, 'rate limiting must run before body parsing');
});
