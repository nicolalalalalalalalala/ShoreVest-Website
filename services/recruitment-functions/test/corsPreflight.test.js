'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const { preflightResponse } = require('../src/lib/http');

function request({
  origin = 'https://shorevest.com',
  method = 'POST',
  headers = 'content-type'
} = {}) {
  const values = {
    origin,
    'access-control-request-method': method,
    'access-control-request-headers': headers
  };
  return {
    method: 'OPTIONS',
    headers: {
      get(name) {
        return values[name.toLowerCase()] || null;
      }
    }
  };
}

const config = {
  requireOrigin: true,
  allowedOrigins: [
    'https://shorevest.com',
    'https://www.shorevest.com'
  ]
};

test('approved JSON POST preflight returns an empty 204 response', () => {
  const result = preflightResponse(request(), config);
  assert.equal(result.status, 204);
  assert.equal(result.body, undefined);
  assert.equal(result.jsonBody, undefined);
  assert.equal(result.headers['Access-Control-Allow-Origin'], 'https://shorevest.com');
  assert.equal(result.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
  assert.equal(result.headers['Access-Control-Allow-Headers'], 'Content-Type');
  assert.equal(result.headers['Access-Control-Max-Age'], '600');
  assert.equal(result.headers['Access-Control-Allow-Credentials'], undefined);
});

test('www origin is accepted but lookalike and missing origins are rejected', () => {
  assert.equal(preflightResponse(request({ origin: 'https://www.shorevest.com' }), config).status, 204);
  assert.equal(preflightResponse(request({ origin: 'https://shorevest.com.attacker.example' }), config).status, 403);
  assert.equal(preflightResponse(request({ origin: '' }), config).status, 403);
});

test('preflight accepts only POST and the Content-Type request header', () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const result = preflightResponse(request({ method }), config);
    assert.equal(result.status, 405);
    assert.equal(result.jsonBody.errorCode, 'METHOD_NOT_ALLOWED');
  }

  for (const headers of [
    'authorization',
    'content-type, authorization',
    'x-api-key',
    'cookie'
  ]) {
    const result = preflightResponse(request({ headers }), config);
    assert.equal(result.status, 403);
    assert.equal(result.jsonBody.errorCode, 'FORBIDDEN');
  }

  assert.equal(preflightResponse(request({ headers: 'Content-Type' }), config).status, 204);
  assert.equal(preflightResponse(request({ headers: '' }), config).status, 204);
});

test('all three public Function registrations include OPTIONS', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/functions/index.js'),
    'utf8'
  );
  for (const name of ['initiateApplication', 'completeUpload', 'finalizeApplication']) {
    const start = source.indexOf(`app.http('${name}'`);
    assert.notEqual(start, -1, `${name} is missing`);
    const next = source.indexOf('\napp.', start + 1);
    const block = source.slice(start, next === -1 ? source.length : next);
    assert.ok(block.includes("methods: ['POST', 'OPTIONS']"), `${name} omits OPTIONS`);
  }
});

test('preflight is handled before dependency construction, rate limiting and body parsing', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/functions/index.js'),
    'utf8'
  );
  const start = source.indexOf('async function httpFlow');
  const end = source.indexOf("\napp.http('initiateApplication'", start);
  const block = source.slice(start, end);
  const preflight = block.indexOf("req.method === 'OPTIONS'");
  const createDependencies = block.indexOf('createDeps(config, trustedContext)');
  const rateLimit = block.indexOf('applyEndpointRateLimit');
  const bodyRead = block.indexOf('readJson(req, config)');

  assert.ok(preflight > -1);
  assert.ok(preflight < createDependencies);
  assert.ok(preflight < rateLimit);
  assert.ok(preflight < bodyRead);
});
