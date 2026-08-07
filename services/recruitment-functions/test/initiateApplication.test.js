'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { ERROR_CODES } = require('../../../api/recruitment/core/constants');
const {
  configured,
  createInitiateApplication
} = require('../src/flows/initiateApplication');

test('initiation wrapper requires both abuse-control adapters', async () => {
  assert.equal(configured({}), false);
  assert.equal(configured({ rateLimiter: { check() {} } }), false);
  assert.equal(configured({ botVerifier: { verify() {} } }), false);
  assert.equal(configured({
    rateLimiter: { check() {} },
    botVerifier: { verify() {} }
  }), true);
});

test('missing abuse controls fail closed before the core flow runs', async () => {
  let coreCalls = 0;
  const logs = [];
  const initiate = createInitiateApplication(async () => {
    coreCalls += 1;
    return { success: true };
  });

  const result = await initiate({ roleId: 'legal-assistant' }, {
    rateLimiter: { async check() { return { allowed: true }; } },
    logger: {
      async log(event, fields) {
        logs.push({ event, fields });
      }
    }
  });

  assert.deepEqual(result, {
    success: false,
    errorCode: ERROR_CODES.SUBMISSION_FAILED
  });
  assert.equal(coreCalls, 0);
  assert.deepEqual(logs, [{
    event: 'initiate_abuse_controls_missing',
    fields: { errorCode: ERROR_CODES.INTERNAL_CONFIGURATION_ERROR }
  }]);
});

test('configured abuse controls allow the core flow to execute', async () => {
  const initiate = createInitiateApplication(async (request, dependencies) => ({
    success: true,
    request,
    dependencies
  }));
  const dependencies = {
    rateLimiter: { async check() { return { allowed: true }; } },
    botVerifier: { async verify() { return { ok: true }; } }
  };
  const request = { roleId: 'legal-assistant' };

  const result = await initiate(request, dependencies);
  assert.equal(result.success, true);
  assert.equal(result.request, request);
  assert.equal(result.dependencies, dependencies);
});

test('wrapper construction rejects a missing core flow', () => {
  assert.throws(() => createInitiateApplication(), /core initiate application flow/);
});
