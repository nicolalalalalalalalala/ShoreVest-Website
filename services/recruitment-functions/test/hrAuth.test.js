'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  parseClientPrincipal,
  principalRoles,
  principalObjectId,
  authorizeHr
} = require('../src/lib/hrAuth');

function request(principal) {
  const encoded = principal == null
    ? null
    : Buffer.from(JSON.stringify(principal)).toString('base64');
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === 'x-ms-client-principal' ? encoded : null;
      }
    }
  };
}

function aadPrincipal(claims = []) {
  return {
    auth_typ: 'aad',
    name_typ: 'name',
    role_typ: 'roles',
    claims
  };
}

function config() {
  return {
    hrAccess: {
      enabled: true,
      platformAuthenticationEnabled: true,
      requiredRole: 'Recruitment.HR'
    }
  };
}

test('valid Easy Auth principal exposes roles and object id', () => {
  const principal = parseClientPrincipal(request(aadPrincipal([
    { typ: 'roles', val: 'Recruitment.HR' },
    { typ: 'oid', val: '00000000-0000-0000-0000-000000000001' }
  ])));
  assert.deepEqual(principalRoles(principal), ['Recruitment.HR']);
  assert.equal(principalObjectId(principal), '00000000-0000-0000-0000-000000000001');
});

test('malformed, non-AAD and missing principals are rejected', () => {
  assert.equal(parseClientPrincipal(request(null)), null);
  assert.equal(parseClientPrincipal({ headers: { get: () => 'not-base64-json' } }), null);
  assert.equal(parseClientPrincipal(request({ auth_typ: 'github', claims: [] })), null);
});

test('HR authorization fails closed when access or platform authentication is disabled', () => {
  const principal = request(aadPrincipal([
    { typ: 'roles', val: 'Recruitment.HR' },
    { typ: 'oid', val: 'object-id' }
  ]));
  const disabled = authorizeHr(principal, {
    hrAccess: {
      enabled: false,
      platformAuthenticationEnabled: true,
      requiredRole: 'Recruitment.HR'
    }
  });
  assert.equal(disabled.status, 503);
  assert.equal(disabled.errorCode, 'HR_ACCESS_DISABLED');

  const unprotected = authorizeHr(principal, {
    hrAccess: {
      enabled: true,
      platformAuthenticationEnabled: false,
      requiredRole: 'Recruitment.HR'
    }
  });
  assert.equal(unprotected.status, 503);
  assert.equal(unprotected.errorCode, 'HR_AUTH_CONFIGURATION_INVALID');
});

test('HR authorization requires the exact app role and an auditable object id', () => {
  assert.equal(authorizeHr(request(null), config()).status, 401);
  const denied = authorizeHr(request(aadPrincipal([
    { typ: 'roles', val: 'Recruitment.Reader' },
    { typ: 'oid', val: 'object-id' }
  ])), config());
  assert.equal(denied.status, 403);
  assert.equal(denied.errorCode, 'HR_ROLE_REQUIRED');

  const missingObjectId = authorizeHr(request(aadPrincipal([
    { typ: 'roles', val: 'Recruitment.HR' }
  ])), config());
  assert.equal(missingObjectId.status, 403);
  assert.equal(missingObjectId.errorCode, 'HR_PRINCIPAL_OBJECT_ID_REQUIRED');

  const allowed = authorizeHr(request(aadPrincipal([
    { typ: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role', val: 'Recruitment.HR' },
    { typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier', val: 'object-id' }
  ])), config());
  assert.equal(allowed.ok, true);
  assert.equal(allowed.principal.objectId, 'object-id');
});
