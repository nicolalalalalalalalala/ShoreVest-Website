'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { accessCleanDocument } = require('../src/hr/documentAccess');

function request({ role = 'Recruitment.HR', applicationReference = 'SV-APP-2026-ABC123', fileReference = 'SV-FILE-ABC12345' } = {}) {
  const principal = role == null ? null : Buffer.from(JSON.stringify({
    auth_typ: 'aad',
    role_typ: 'roles',
    claims: [
      { typ: 'roles', val: role },
      { typ: 'oid', val: 'hr-object-id' }
    ]
  })).toString('base64');
  return {
    params: { applicationReference, fileReference },
    headers: {
      get(name) {
        return name.toLowerCase() === 'x-ms-client-principal' ? principal : null;
      }
    }
  };
}

function config() {
  return {
    cleanContainer: 'recruitment-clean',
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
          finalizedAtUtc: '2026-07-22T00:01:00.000Z',
          candidateSubmissionStatus: 'Submitted'
        };
      },
      async getFile() {
        return {
          applicationReference: 'SV-APP-2026-ABC123',
          fileReference: 'SV-FILE-ABC12345',
          originalFileName: 'candidate-cv.pdf',
          declaredMimeType: 'application/pdf',
          sizeBytes: 1024,
          expectedHash: 'a'.repeat(64),
          technicalStatus: 'Ready',
          scanResult: 'Clean',
          cleanBlobPath: 'recruitment/2026/legal-assistant/SV-APP-2026-ABC123/SV-FILE-ABC12345.pdf'
        };
      }
    },
    storage: {
      async verify(input) {
        assert.equal(input.container, 'recruitment-clean');
        assert.equal(input.expectedSizeBytes, 1024);
        assert.equal(input.expectedContentType, 'application/pdf');
        assert.equal(input.expectedHash, 'a'.repeat(64));
        return { ok: true, sha256: 'a'.repeat(64) };
      },
      async issueRead(input) {
        return {
          url: `https://storage.example/${input.blobPath}?sp=r`,
          expiresAtUtc: input.expiresAtUtc,
          method: 'GET'
        };
      }
    },
    async now() {
      return new Date('2026-07-22T00:05:00.000Z');
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

test('unauthenticated and wrong-role requests are denied before storage access', async () => {
  let reads = 0;
  const deps = dependencies({
    storage: {
      async verify() {
        reads += 1;
      }
    }
  });
  assert.equal((await accessCleanDocument(request({ role: null }), config(), deps)).status, 401);
  assert.equal((await accessCleanDocument(request({ role: 'Recruitment.Reader' }), config(), deps)).status, 403);
  assert.equal(reads, 0);
});

test('invalid references are rejected', async () => {
  const result = await accessCleanDocument(
    request({ applicationReference: '../bad' }),
    config(),
    dependencies()
  );
  assert.equal(result.status, 400);
  assert.equal(result.jsonBody.errorCode, 'REFERENCE_INVALID');
});

test('dirty, unfinalized and mismatched records do not receive a SAS', async () => {
  const unfinalized = dependencies({
    applicationStore: {
      async getApplication() {
        return { applicationReference: 'SV-APP-2026-ABC123', finalizedAtUtc: null, candidateSubmissionStatus: 'Draft' };
      },
      async getFile() {
        return { applicationReference: 'SV-APP-2026-ABC123', fileReference: 'SV-FILE-ABC12345' };
      }
    }
  });
  assert.equal((await accessCleanDocument(request(), config(), unfinalized)).jsonBody.errorCode, 'APPLICATION_NOT_FINALIZED');

  const dirty = dependencies({
    applicationStore: {
      async getApplication() {
        return { applicationReference: 'SV-APP-2026-ABC123', finalizedAtUtc: 'x', candidateSubmissionStatus: 'Submitted' };
      },
      async getFile() {
        return {
          applicationReference: 'SV-APP-2026-ABC123',
          fileReference: 'SV-FILE-ABC12345',
          technicalStatus: 'Malicious',
          scanResult: 'Malicious'
        };
      }
    }
  });
  assert.equal((await accessCleanDocument(request(), config(), dirty)).jsonBody.errorCode, 'DOCUMENT_NOT_READY');

  const mismatch = dependencies({
    storage: {
      async verify() {
        return { ok: false, reason: 'hash' };
      }
    }
  });
  assert.equal((await accessCleanDocument(request(), config(), mismatch)).jsonBody.errorCode, 'CLEAN_DOCUMENT_MISMATCH');
});

test('authorized HR receives one five-minute read-only clean Blob URL', async () => {
  const deps = dependencies();
  const result = await accessCleanDocument(request(), config(), deps);
  assert.equal(result.status, 200);
  assert.equal(result.jsonBody.success, true);
  assert.ok(result.jsonBody.url.includes('sp=r'));
  assert.equal(result.jsonBody.downloadName, 'candidate-cv.pdf');
  assert.equal(result.jsonBody.expiresAtUtc, '2026-07-22T00:10:00.000Z');
  assert.equal(result.jsonBody.cleanBlobPath, undefined);
  assert.equal(deps.logs.length, 1);
  assert.equal(deps.logs[0].fields.principalObjectId, 'hr-object-id');
  assert.equal(deps.logs[0].fields.verifiedSha256, 'a'.repeat(64));
});
