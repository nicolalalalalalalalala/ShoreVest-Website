'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/functions/index.js'),
  'utf8'
);
const endpointRateLimitSource = fs.readFileSync(
  path.resolve(__dirname, '../src/lib/endpointRateLimit.js'),
  'utf8'
);

test('completion and finalization routes use fixed scoped rate limits', () => {
  const completeStart = source.indexOf("app.http('completeUpload'");
  const finalizeStart = source.indexOf("app.http('finalizeApplication'");
  const hrStart = source.indexOf("app.http('hrCleanDocumentAccess'");

  const completeRoute = source.slice(completeStart, finalizeStart);
  const finalizeRoute = source.slice(finalizeStart, hrStart);

  assert.ok(completeRoute.includes('rateLimitScope: RATE_LIMIT_SCOPES.complete'));
  assert.ok(finalizeRoute.includes('rateLimitScope: RATE_LIMIT_SCOPES.finalize'));
  assert.ok(!completeRoute.includes('clientSubmissionId'));
  assert.ok(!finalizeRoute.includes('clientSubmissionId'));
});

test('scoped rate limit executes before the domain flow', () => {
  const flowStart = source.indexOf('async function httpFlow');
  const flowEnd = source.indexOf("app.http('initiateApplication'");
  const flow = source.slice(flowStart, flowEnd);

  const limiter = flow.indexOf('await applyEndpointRateLimit({');
  const domainFlow = flow.indexOf('await flow(parsed.body, dependencies)');
  assert.ok(limiter >= 0);
  assert.ok(flow.includes('scope: options.rateLimitScope'));
  assert.ok(domainFlow > limiter);
  assert.ok(endpointRateLimitSource.includes('status: 429'));
  assert.ok(endpointRateLimitSource.includes("'Retry-After'"));
});
