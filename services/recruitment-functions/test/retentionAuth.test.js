'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { authorizeRetentionAdmin } = require('../src/lib/hrAuth');

function request(role, objectId = 'object-id') {
  const encoded = role == null ? null : Buffer.from(JSON.stringify({
    auth_typ: 'aad',
    role_typ: 'roles',
    claims: [
      { typ: 'roles', val: role },
      ...(objectId ? [{ typ: 'oid', val: objectId }] : [])
    ]
  })).toString('base64');
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === 'x-ms-client-principal' ? encoded : null;
      }
    }
  };
}

function config(patch = {}) {
  return {
    retention: {
      enabled: true,
      platformAuthenticationEnabled: true,
      adminRole: 'Recruitment.RetentionAdmin',
      ...patch
    }
  };
}

test('retention administration is separately disabled and separately authorized', () => {
  assert.equal(authorizeRetentionAdmin(request('Recruitment.RetentionAdmin'), config({ enabled: false })).errorCode, 'RETENTION_DISABLED');

  assert.equal(authorizeRetentionAdmin(request('Recruitment.RetentionAdmin'), config({
    platformAuthenticationEnabled: false
  })).errorCode, 'RETENTION_AUTH_CONFIGURATION_INVALID');

  assert.equal(authorizeRetentionAdmin(request(null), config()).status, 401);

  assert.equal(authorizeRetentionAdmin(request('Recruitment.HR'), config()).errorCode, 'RETENTION_ADMIN_ROLE_REQUIRED');

  const missingObjectId = authorizeRetentionAdmin(
    request('Recruitment.RetentionAdmin', null),
    config()
  );
  assert.equal(missingObjectId.status, 403);
  assert.equal(missingObjectId.errorCode, 'RETENTION_PRINCIPAL_OBJECT_ID_REQUIRED');

  const allowed = authorizeRetentionAdmin(request('Recruitment.RetentionAdmin'), config());
  assert.equal(allowed.ok, true);
  assert.equal(allowed.principal.objectId, 'object-id');
});
