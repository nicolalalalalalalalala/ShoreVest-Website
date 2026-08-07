'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createReadinessProbe } = require('../src/lib/readiness');

function validConfig(patch = {}) {
  return {
    apiEnabled: false,
    environment: 'production',
    allowedOrigins: ['https://shorevest.com'],
    managedIdentityClientId: 'identity',
    cosmosEndpoint: 'https://cosmos.example',
    cosmosDatabase: 'recruitment',
    storageAccountUrl: 'https://storage.example',
    keyVaultUrl: 'https://vault.example',
    completionTokenSecretName: 'completion',
    fingerprintSecretName: 'fingerprint',
    rateLimit: { enabled: true },
    botVerification: {
      mode: 'turnstile',
      secretName: 'turnstile',
      expectedHostnames: ['shorevest.com'],
      expectedAction: 'recruitment-application'
    },
    outboxDelivery: { enabled: false },
    graph: { endpoint: 'https://graph.microsoft.com/v1.0' },
    sharePoint: {},
    candidateAcknowledgement: {},
    hrAccess: {
      enabled: false,
      platformAuthenticationEnabled: false,
      requiredRole: 'Recruitment.HR',
      readSasSeconds: 300
    },
    retention: {
      enabled: false,
      deletionEnabled: false,
      platformAuthenticationEnabled: false,
      adminRole: 'Recruitment.RetentionAdmin',
      policyVersion: '',
      incompleteHours: 48,
      submittedDays: 365,
      maliciousDays: 30,
      batchSize: 10,
      leaseSeconds: 300,
      retrySeconds: 900
    },
    ...patch
  };
}

test('readiness reports invalid configuration without touching dependencies', async () => {
  let called = 0;
  const probe = createReadinessProbe();
  const result = await probe(validConfig({ cosmosEndpoint: '' }), {
    async health() {
      called += 1;
      return { ok: true };
    }
  });

  assert.deepEqual(result, {
    ok: false,
    runtime: 'active',
    configuration: 'invalid',
    dependencies: 'not-checked'
  });
  assert.equal(called, 0);
});

test('readiness checks Cosmos and Blob Storage and returns generic status', async () => {
  const calls = [];
  const probe = createReadinessProbe();
  const result = await probe(validConfig(), {
    async health() {
      calls.push('cosmos');
      return { ok: true };
    },
    storage: {
      async health() {
        calls.push('storage');
        return { ok: true };
      }
    }
  });

  assert.deepEqual(calls.sort(), ['cosmos', 'storage']);
  assert.deepEqual(result, {
    ok: true,
    runtime: 'active',
    configuration: 'valid',
    dependencies: 'ready'
  });
});

test('enabled API checks Key Vault secrets and enabled delivery checks Graph resources', async () => {
  const secretCalls = [];
  const graphCalls = [];
  const probe = createReadinessProbe();
  const config = validConfig({
    apiEnabled: true,
    outboxDelivery: { enabled: true },
    sharePoint: {
      siteId: 'site',
      applicationsListId: 'applications',
      filesListId: 'files'
    },
    candidateAcknowledgement: {
      enabled: true,
      templateApproved: true,
      mailbox: 'recruitment@shorevest.com',
      privacyNoticeUrl: 'https://shorevest.com/privacy-policy/'
    },
    hrAccess: {
      enabled: true,
      platformAuthenticationEnabled: true,
      requiredRole: 'Recruitment.HR',
      readSasSeconds: 300
    },
    retention: {
      enabled: true,
      deletionEnabled: true,
      platformAuthenticationEnabled: true,
      adminRole: 'Recruitment.RetentionAdmin',
      policyVersion: 'retention-v1',
      incompleteHours: 48,
      submittedDays: 365,
      maliciousDays: 30,
      batchSize: 10,
      leaseSeconds: 300,
      retrySeconds: 900
    }
  });

  const result = await probe(config, {
    async health() { return { ok: true }; },
    storage: { async health() { return { ok: true }; } },
    secretProvider: {
      async health(names) {
        secretCalls.push(names);
        return { ok: true };
      }
    },
    graph: {
      async health(input) {
        graphCalls.push(input);
        return { ok: true };
      }
    }
  });

  assert.deepEqual(secretCalls[0], ['completion', 'fingerprint', 'turnstile']);
  assert.deepEqual(graphCalls[0], {
    siteId: 'site',
    applicationsListId: 'applications',
    filesListId: 'files',
    mailbox: 'recruitment@shorevest.com'
  });
  assert.equal(result.ok, true);
});

test('readiness refuses an enabled API when Turnstile constraints drift from the allowed origin', async () => {
  let dependencyCalls = 0;
  const probe = createReadinessProbe();
  const result = await probe(validConfig({
    apiEnabled: true,
    botVerification: {
      mode: 'turnstile',
      secretName: 'turnstile',
      expectedHostnames: ['www.shorevest.com'],
      expectedAction: 'recruitment-application'
    }
  }), {
    async health() {
      dependencyCalls += 1;
      return { ok: true };
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.configuration, 'invalid');
  assert.equal(result.dependencies, 'not-checked');
  assert.equal(dependencyCalls, 0);
});

test('readiness caches failures without exposing the failing dependency', async () => {
  let attempts = 0;
  let clock = 1000;
  const probe = createReadinessProbe({ ttlMs: 30000, now: () => clock });
  const dependencies = {
    async health() {
      attempts += 1;
      throw new Error('private infrastructure detail');
    },
    storage: { async health() { return { ok: true }; } }
  };

  const first = await probe(validConfig(), dependencies);
  const second = await probe(validConfig(), dependencies);
  assert.equal(first.ok, false);
  assert.equal(first.dependencies, 'unavailable');
  assert.deepEqual(second, first);
  assert.equal(attempts, 1);

  clock += 30001;
  await probe(validConfig(), dependencies);
  assert.equal(attempts, 2);
});
