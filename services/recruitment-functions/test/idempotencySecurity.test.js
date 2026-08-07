'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  activeCredentialGeneration,
  sanitizeIdempotencyRecord,
  secureIdempotencyAdapter
} = require('../src/adapters/idempotencySecurity');

test('credential fields are removed from idempotency records and claim wrappers', () => {
  const sanitized = sanitizeIdempotencyRecord({
    state: 'CredentialsIssued',
    result: {
      upload: { url: 'https://blob.example/sas-secret' },
      completionToken: 'signed-secret'
    },
    record: {
      result: {
        upload: { url: 'https://blob.example/other-secret' },
        completionToken: 'other-token'
      }
    },
    stableResult: {
      applicationReference: 'APP-1',
      credentialGeneration: 2
    }
  });

  assert.equal(sanitized.result, undefined);
  assert.equal(sanitized.record.result, undefined);
  assert.deepEqual(sanitized.stableResult, {
    applicationReference: 'APP-1',
    credentialGeneration: 2
  });
  assert.ok(!JSON.stringify(sanitized).includes('sas-secret'));
  assert.ok(!JSON.stringify(sanitized).includes('signed-secret'));
});

test('active credential metadata survives retryable and lease-recovery states', () => {
  const active = {
    stableResult: {
      credentialGeneration: 3,
      lastCredentialExpiryUtc: '2999-01-01T00:00:00.000Z'
    }
  };

  for (const state of [
    'CredentialsIssued',
    'CredentialIssuing',
    'CredentialRetryable',
    'RetryableFailure',
    'Claimed',
    'SubmissionReserved'
  ]) {
    assert.equal(activeCredentialGeneration({ ...active, state }, Date.parse('2026-07-22T00:00:00.000Z')), 3);
  }

  assert.equal(activeCredentialGeneration({
    state: 'CredentialsIssued',
    stableResult: {
      credentialGeneration: 3,
      lastCredentialExpiryUtc: '2026-07-21T23:59:59.000Z'
    }
  }, Date.parse('2026-07-22T00:00:00.000Z')), null);

  for (const state of ['Completed', 'PermanentFailure']) {
    assert.equal(activeCredentialGeneration({ ...active, state }, Date.parse('2026-07-22T00:00:00.000Z')), null);
  }
});

test('production credentialsIssued persists only stable metadata', async () => {
  const calls = [];
  const underlying = {
    async claim() {
      return {
        status: 'reserved',
        record: {
          state: 'CredentialsIssued',
          result: { completionToken: 'legacy-secret' },
          stableResult: { applicationReference: 'APP-1' }
        }
      };
    },
    async get() {
      return {
        state: 'CredentialsIssued',
        result: { upload: { url: 'legacy-sas' } },
        stableResult: { applicationReference: 'APP-1' }
      };
    },
    async beginCredentialIssuance() {
      return { status: 'claimed', generation: 2 };
    },
    async credentialsIssued(key, credentialResult, stableResult) {
      calls.push({ key, credentialResult, stableResult });
      return { state: 'CredentialsIssued', stableResult };
    }
  };
  const secured = secureIdempotencyAdapter(underlying);

  const claim = await secured.claim('key');
  const record = await secured.get('key');
  assert.equal(claim.record.result, undefined);
  assert.equal(record.result, undefined);

  await secured.credentialsIssued(
    'key',
    {
      completionToken: 'do-not-store',
      upload: { url: 'https://blob.example/write-sas' }
    },
    {
      applicationReference: 'APP-1',
      fileReference: 'FILE-1',
      credentialGeneration: 3,
      lastCredentialExpiryUtc: '2026-07-22T00:10:00.000Z'
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].credentialResult, null);
  assert.equal(calls[0].stableResult.credentialGeneration, 3);
  assert.ok(!JSON.stringify(calls).includes('do-not-store'));
  assert.ok(!JSON.stringify(calls).includes('write-sas'));
});

test('retry reissues credentials on the active generation without exposing stored secrets', async () => {
  const calls = [];
  const underlying = {
    async get() {
      return {
        state: 'CredentialsIssued',
        result: {
          upload: { url: 'https://blob.example/legacy-sas' },
          completionToken: 'legacy-token'
        },
        stableResult: {
          credentialGeneration: 7,
          lastCredentialExpiryUtc: '2999-01-01T00:00:00.000Z'
        }
      };
    },
    async beginCredentialIssuance(key, owner, leaseExpiresAtUtc) {
      calls.push({ key, owner, leaseExpiresAtUtc });
      return {
        status: 'claimed',
        generation: 8,
        record: {
          result: {
            upload: { url: 'https://blob.example/another-secret-sas' },
            completionToken: 'another-secret-token'
          }
        }
      };
    },
    async credentialsIssued() {}
  };

  const secured = secureIdempotencyAdapter(underlying);
  const lease = await secured.beginCredentialIssuance(
    'init:role:submission',
    'worker-1',
    '2999-01-01T00:02:00.000Z'
  );

  assert.equal(calls.length, 1);
  assert.equal(lease.status, 'claimed');
  assert.equal(lease.generation, 7);
  assert.equal(lease.reissuedActiveCredentials, true);
  assert.equal(lease.record.result, undefined);
  assert.ok(!JSON.stringify(lease).includes('secret'));
});

test('retryable issuance failure does not rotate an earlier active upload generation', async () => {
  const underlying = {
    async get() {
      return {
        state: 'RetryableFailure',
        stableResult: {
          credentialGeneration: 7,
          lastCredentialExpiryUtc: '2999-01-01T00:00:00.000Z'
        }
      };
    },
    async beginCredentialIssuance() {
      return { status: 'claimed', generation: 9 };
    },
    async credentialsIssued() {}
  };

  const lease = await secureIdempotencyAdapter(underlying).beginCredentialIssuance('key');
  assert.equal(lease.generation, 7);
  assert.equal(lease.reissuedActiveCredentials, true);
});

test('expired credential metadata allows the next generation to advance', async () => {
  const underlying = {
    async get() {
      return {
        state: 'CredentialsIssued',
        stableResult: {
          credentialGeneration: 7,
          lastCredentialExpiryUtc: '2000-01-01T00:00:00.000Z'
        }
      };
    },
    async beginCredentialIssuance() {
      return { status: 'claimed', generation: 8 };
    },
    async credentialsIssued() {}
  };

  const lease = await secureIdempotencyAdapter(underlying).beginCredentialIssuance('key');
  assert.equal(lease.generation, 8);
  assert.equal(lease.reissuedActiveCredentials, undefined);
});
