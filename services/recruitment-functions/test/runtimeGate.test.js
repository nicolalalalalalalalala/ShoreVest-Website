'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/functions/index.js'),
  'utf8'
);

test('public API validates full configuration before dependency creation', () => {
  const flowStart = source.indexOf('async function httpFlow');
  const flowEnd = source.indexOf("app.http('initiateApplication'");
  const flow = source.slice(flowStart, flowEnd);

  const disabledGate = flow.indexOf('if (!config.apiEnabled)');
  const configurationGate = flow.indexOf("configurationUnavailable(req, config, context, 'public-api')");
  const dependencyCreation = flow.indexOf('createDeps(config, trustedContext)');

  assert.ok(disabledGate >= 0);
  assert.ok(configurationGate > disabledGate);
  assert.ok(dependencyCreation > configurationGate);
});

test('outbox worker validates configuration before claiming events', () => {
  const workerStart = source.indexOf("app.timer('outboxWorker'");
  const workerEnd = source.indexOf("app.http('health'");
  const worker = source.slice(workerStart, workerEnd);

  assert.ok(worker.indexOf('const shape = validateConfig(config)') >= 0);
  assert.ok(worker.indexOf('if (!shape.ok)') >= 0);
  assert.ok(worker.indexOf('claimOutboxBatch') > worker.indexOf('if (!shape.ok)'));
});
