'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { updateRetentionControl } = require('../src/hr/retentionControl');

function principalRequest({
  role = 'Recruitment.RetentionAdmin',
  applicationReference = 'SV-APP-2026-ABC123'
} = {}) {
  const encoded = role == null ? null : Buffer.from(JSON.stringify({
    auth_typ: 'aad',
    role_typ: 'roles',
    claims: [
      { typ: 'roles', val: role },
      { typ: 'oid', val: 'retention-admin-object-id' }
    ]
  })).toString('base64');
  return {
    params: { applicationReference },
    headers: {
      get(name) {
        return name.toLowerCase() === 'x-ms-client-principal' ? encoded : null;
      }
    }
  };
}

function config() {
  return {
    retention: {
      enabled: true,
      platformAuthenticationEnabled: true,
      adminRole: 'Recruitment.RetentionAdmin'
    }
  };
}

function dependencies(patch = {}) {
  const logs = [];
  return {
    async now() {
      return new Date('2026-07-22T00:00:00.000Z');
    },
    retention: {
      async updateControls(input) {
        return {
          applicationReference: input.applicationReference,
          legalHold: input.legalHold,
          retentionDeleteAfterUtc: input.retentionDeleteAfterUtc,
          retentionPolicyVersion: 'retention-v1',
          retentionState: 'Active'
        };
      }
    },
    logger: {
      async log(event, fields) {
        logs.push({ event, fields });
      }
    },
    logs,
    ...patch
  };
}

test('retention controls require authentication and the separate admin role', async () => {
  assert.equal((await updateRetentionControl(
    principalRequest({ role: null }),
    config(),
    dependencies(),
    { legalHold: true, reason: 'Legal preservation request for current proceedings.' }
  )).status, 401);

  const denied = await updateRetentionControl(
    principalRequest({ role: 'Recruitment.HR' }),
    config(),
    dependencies(),
    { legalHold: true, reason: 'Legal preservation request for current proceedings.' }
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.jsonBody.errorCode, 'RETENTION_ADMIN_ROLE_REQUIRED');
});

test('invalid references and control payloads are rejected before writes', async () => {
  let writes = 0;
  const deps = dependencies({
    retention: {
      async updateControls() {
        writes += 1;
      }
    }
  });
  assert.equal((await updateRetentionControl(
    principalRequest({ applicationReference: '../bad' }),
    config(),
    deps,
    { legalHold: true, reason: 'Legal preservation request for current proceedings.' }
  )).status, 400);
  assert.equal((await updateRetentionControl(
    principalRequest(),
    config(),
    deps,
    { legalHold: true, reason: 'short' }
  )).jsonBody.errorCode, 'RETENTION_REASON_INVALID');
  assert.equal(writes, 0);
});

test('legal hold changes record the administrator and reason', async () => {
  let control;
  const deps = dependencies({
    retention: {
      async updateControls(input) {
        control = input;
        return {
          applicationReference: input.applicationReference,
          legalHold: input.legalHold,
          retentionDeleteAfterUtc: input.retentionDeleteAfterUtc,
          retentionPolicyVersion: 'retention-v1',
          retentionState: 'Active'
        };
      }
    }
  });
  const result = await updateRetentionControl(
    principalRequest(),
    config(),
    deps,
    {
      legalHold: true,
      reason: 'Legal preservation request for active proceedings.'
    }
  );

  assert.equal(result.status, 200);
  assert.equal(control.principalObjectId, 'retention-admin-object-id');
  assert.equal(control.reason, 'Legal preservation request for active proceedings.');
  assert.equal(control.legalHold, true);
  assert.equal(deps.logs.length, 1);
  assert.equal(deps.logs[0].event, 'retention_control_updated');
});

test('active purge lease returns conflict instead of changing legal hold', async () => {
  const result = await updateRetentionControl(
    principalRequest(),
    config(),
    dependencies({
      retention: {
        async updateControls() {
          throw Object.assign(new Error('purge in progress'), {
            code: 'RETENTION_PURGE_IN_PROGRESS'
          });
        }
      }
    }),
    {
      legalHold: true,
      reason: 'Legal preservation request received during deletion processing.'
    }
  );
  assert.equal(result.status, 409);
  assert.equal(result.jsonBody.errorCode, 'RETENTION_PURGE_IN_PROGRESS');
});

test('missing applications return not found', async () => {
  const result = await updateRetentionControl(
    principalRequest(),
    config(),
    dependencies({
      retention: { async updateControls() { return null; } }
    }),
    {
      legalHold: false,
      retentionDeleteAfterUtc: '2027-07-22T00:00:00Z',
      reason: 'Legal confirmed the preservation requirement has ended.'
    }
  );
  assert.equal(result.status, 404);
  assert.equal(result.jsonBody.errorCode, 'APPLICATION_NOT_FOUND');
});
