'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const {
  statusForResult,
  flowHttpResponse
} = require('../src/lib/flowResponse');

function request(origin = 'https://shorevest.com') {
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === 'origin' ? origin : null;
      }
    }
  };
}

const config = {
  allowedOrigins: ['https://shorevest.com'],
  requireOrigin: true
};

test('flow status mapping distinguishes retryable, server and client outcomes', () => {
  assert.equal(statusForResult({ success: true }), 200);
  assert.equal(statusForResult({ success: false, errorCode: 'SUBMISSION_IN_PROGRESS' }), 409);
  assert.equal(statusForResult({ success: false, errorCode: 'EVENT_IN_PROGRESS' }), 409);
  assert.equal(statusForResult({ success: false, errorCode: 'IDEMPOTENCY_CONFLICT' }), 409);
  assert.equal(statusForResult({ success: false, errorCode: 'INFRASTRUCTURE_RETRYABLE' }), 503);
  assert.equal(statusForResult({ success: false, errorCode: 'SUBMISSION_FAILED' }), 500);
  assert.equal(statusForResult({ success: false, errorCode: 'VALIDATION_FAILED' }), 400);
});

test('retryable flow responses include a bounded Retry-After header', () => {
  const inProgress = flowHttpResponse(request(), config, {
    success: false,
    errorCode: 'SUBMISSION_IN_PROGRESS',
    retryAfterMs: 2500
  });
  assert.equal(inProgress.status, 409);
  assert.equal(inProgress.headers['Retry-After'], '3');
  assert.equal(inProgress.headers['Access-Control-Allow-Origin'], 'https://shorevest.com');
  assert.equal(inProgress.jsonBody.retryAfterMs, 2500);

  const infrastructure = flowHttpResponse(request(), config, {
    success: false,
    errorCode: 'INFRASTRUCTURE_RETRYABLE'
  });
  assert.equal(infrastructure.status, 503);
  assert.equal(infrastructure.headers['Retry-After'], '1');
});

test('non-retryable flow errors do not receive a Retry-After header', () => {
  const response = flowHttpResponse(request(), config, {
    success: false,
    errorCode: 'VALIDATION_FAILED'
  });
  assert.equal(response.status, 400);
  assert.equal(response.headers['Retry-After'], undefined);
});

test('public Function flow routes use the shared response mapper', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/functions/index.js'),
    'utf8'
  );
  assert.ok(source.includes("const { flowHttpResponse } = require('../lib/flowResponse')"));
  assert.ok(source.includes('return flowHttpResponse(req, config, result)'));
  assert.ok(!source.includes('status: result.success ? 200 : 400'));
});
