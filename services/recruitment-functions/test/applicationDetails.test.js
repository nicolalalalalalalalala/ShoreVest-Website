'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { getApplicationDetails } = require('../src/hr/applicationDetails');

function request({ role = 'Recruitment.HR', applicationReference = 'SV-APP-2026-ABC123' } = {}) {
  const principal = role == null ? null : Buffer.from(JSON.stringify({
    auth_typ: 'aad',
    role_typ: 'roles',
    claims: [
      { typ: 'roles', val: role },
      { typ: 'oid', val: 'hr-object-id' }
    ]
  })).toString('base64');
  return {
    params: { applicationReference },
    headers: {
      get(name) {
        return name.toLowerCase() === 'x-ms-client-principal' ? principal : null;
      }
    }
  };
}

function config() {
  return {
    hrAccess: {
      enabled: true,
      platformAuthenticationEnabled: true,
      requiredRole: 'Recruitment.HR',
      readSasSeconds: 300
    }
  };
}

function dependencies(patch = {}) {
  const logs = [];
  return {
    applicationStore: {
      async getApplication() {
        return {
          applicationReference: 'SV-APP-2026-ABC123',
          roleId: 'legal-assistant',
          roleTitle: 'Legal Assistant',
          candidateName: 'Test Candidate',
          candidateEmail: 'test@example.com',
          finalizedAtUtc: '2026-08-09T01:36:04.928Z',
          candidateSubmissionStatus: 'Submitted',
          source: 'direct'
        };
      }
    },
    projectionReader: {
      async getFilesForApplication() {
        return [{
          fileReference: 'SV-FILE-ABC12345',
          filePurpose: 'CV',
          originalFileName: 'candidate-cv.pdf',
          declaredMimeType: 'application/pdf',
          sizeBytes: 1234,
          technicalStatus: 'Ready',
          scanResult: 'Clean',
          readyAtUtc: '2026-08-09T01:37:00.000Z',
          cleanBlobPath: 'secret/container/path.pdf',
          expectedHash: 'a'.repeat(64)
        }];
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

test('application details require authenticated Recruitment.HR role', async () => {
  let reads = 0;
  const deps = dependencies({
    applicationStore: {
      async getApplication() {
        reads += 1;
        return null;
      }
    }
  });
  assert.equal((await getApplicationDetails(request({ role: null }), config(), deps)).status, 401);
  assert.equal((await getApplicationDetails(request({ role: 'Recruitment.Reader' }), config(), deps)).status, 403);
  assert.equal(reads, 0);
});

test('application details reject invalid or unknown references', async () => {
  const invalid = await getApplicationDetails(
    request({ applicationReference: '../bad' }),
    config(),
    dependencies()
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.jsonBody.errorCode, 'REFERENCE_INVALID');

  const missing = await getApplicationDetails(
    request(),
    config(),
    dependencies({
      applicationStore: { async getApplication() { return null; } }
    })
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.jsonBody.errorCode, 'APPLICATION_NOT_FOUND');
});

test('authorized HR receives application summary and file references without storage secrets', async () => {
  const deps = dependencies();
  const result = await getApplicationDetails(request(), config(), deps);
  assert.equal(result.status, 200);
  assert.equal(result.jsonBody.success, true);
  assert.equal(result.jsonBody.application.roleTitle, 'Legal Assistant');
  assert.equal(result.jsonBody.files.length, 1);
  assert.equal(result.jsonBody.files[0].fileReference, 'SV-FILE-ABC12345');
  assert.equal(result.jsonBody.files[0].availableForHrAccess, true);
  assert.equal(result.jsonBody.files[0].cleanBlobPath, undefined);
  assert.equal(result.jsonBody.files[0].expectedHash, undefined);
  assert.equal(deps.logs.length, 1);
  assert.equal(deps.logs[0].fields.principalObjectId, 'hr-object-id');
});
