'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadConfig } = require('../src/lib/config');
const {
  runPolicyAssignment,
  runRetentionPurge,
  runIdempotencyCleanup
} = require('../src/retention/worker');

function context() {
  return {
    invocationId: 'worker-1',
    warnings: [],
    warn(event, fields) {
      this.warnings.push({ event, fields });
    }
  };
}

function validConfig(overrides = {}) {
  const config = loadConfig({
    RECRUITMENT_API_ENABLED: 'false',
    RECRUITMENT_ENVIRONMENT: 'production',
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com',
    RECRUITMENT_MANAGED_IDENTITY_CLIENT_ID: '00000000-0000-0000-0000-000000000001',
    RECRUITMENT_COSMOS_ENDPOINT: 'https://example.documents.azure.com',
    RECRUITMENT_COSMOS_DATABASE: 'recruitment',
    RECRUITMENT_STORAGE_ACCOUNT_URL: 'https://example.blob.core.windows.net',
    RECRUITMENT_KEYVAULT_URL: 'https://example.vault.azure.net',
    RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME: 'completion',
    RECRUITMENT_FINGERPRINT_SECRET_NAME: 'fingerprint',
    RECRUITMENT_OUTBOX_DELIVERY_ENABLED: 'true',
    RECRUITMENT_SHAREPOINT_SITE_ID: 'site-id',
    RECRUITMENT_APPLICATIONS_LIST_ID: 'applications-list',
    RECRUITMENT_FILES_LIST_ID: 'files-list',
    RECRUITMENT_CANDIDATE_ACK_ENABLED: 'true',
    RECRUITMENT_CANDIDATE_ACK_TEMPLATE_APPROVED: 'true',
    RECRUITMENT_CANDIDATE_ACK_MAILBOX: 'hr@shorevest.com',
    RECRUITMENT_PLATFORM_AUTH_ENABLED: 'true',
    RECRUITMENT_RETENTION_ENABLED: 'true',
    RECRUITMENT_RETENTION_DELETION_ENABLED: 'true',
    RECRUITMENT_RETENTION_POLICY_VERSION: 'retention-v1',
    RECRUITMENT_RETENTION_ADMIN_ROLE: 'Recruitment.RetentionAdmin',
    RECRUITMENT_RETENTION_BATCH_SIZE: '10',
    RECRUITMENT_RETENTION_LEASE_SECONDS: '900',
    RECRUITMENT_RETENTION_RETRY_SECONDS: '3600'
  });
  return {
    ...config,
    ...overrides,
    retention: {
      ...config.retention,
      ...(overrides.retention || {})
    }
  };
}

test('retention workers do nothing while the feature is disabled', async () => {
  let called = false;
  const dependencies = {
    retention: {
      async listPolicyCandidates() { called = true; },
      async claimDueBatch() { called = true; },
      async listIdempotencyCleanupCandidates() { called = true; }
    }
  };

  assert.deepEqual(await runPolicyAssignment({ retention: { enabled: false } }, dependencies, context()), {
    assigned: 0,
    skipped: true
  });
  assert.deepEqual(await runRetentionPurge({
    retention: { enabled: true, deletionEnabled: false }
  }, dependencies, context()), {
    purged: 0,
    skipped: true
  });
  assert.deepEqual(await runIdempotencyCleanup({
    retention: { enabled: true, deletionEnabled: false }
  }, dependencies, context()), {
    cleaned: 0,
    skipped: true
  });
  assert.equal(called, false);
});

test('retention workers refuse invalid enabled configuration before durable work', async () => {
  let called = false;
  const dependencies = {
    retention: {
      async listPolicyCandidates() { called = true; },
      async claimDueBatch() { called = true; },
      async listIdempotencyCleanupCandidates() { called = true; }
    }
  };
  const invalid = {
    retention: {
      enabled: true,
      deletionEnabled: true,
      policyVersion: '',
      batchSize: 10,
      leaseSeconds: 300,
      retrySeconds: 900
    },
    outboxDelivery: { enabled: false }
  };

  assert.deepEqual(await runPolicyAssignment(invalid, dependencies, context()), {
    assigned: 0,
    skipped: true,
    reason: 'CONFIGURATION_INVALID'
  });
  assert.deepEqual(await runRetentionPurge(invalid, dependencies, context()), {
    purged: 0,
    skipped: true,
    reason: 'CONFIGURATION_INVALID'
  });
  assert.deepEqual(await runIdempotencyCleanup(invalid, dependencies, context()), {
    cleaned: 0,
    skipped: true,
    reason: 'CONFIGURATION_INVALID'
  });
  assert.equal(called, false);
});

test('policy assignment processes each candidate independently', async () => {
  const assigned = [];
  const ctx = context();
  const config = validConfig();
  const result = await runPolicyAssignment(config, {
    retention: {
      async listPolicyCandidates(input) {
        assert.deepEqual(input, { limit: 10, policyVersion: 'retention-v1' });
        return ['APP-1', 'APP-2', 'APP-3'];
      },
      async applyPolicy(reference) {
        if (reference === 'APP-2') throw Object.assign(new Error('conflict'), { code: 'RETENTION_CONFLICT' });
        assigned.push(reference);
        return { status: reference === 'APP-3' ? 'current' : 'updated' };
      }
    }
  }, ctx);

  assert.deepEqual(assigned, ['APP-1', 'APP-3']);
  assert.deepEqual(result, { assigned: 1, examined: 3 });
  assert.equal(ctx.warnings.length, 1);
  assert.equal(ctx.warnings[0].fields.applicationReference, 'APP-2');
});

test('purge claims due applications and deletes each independently', async () => {
  const purged = [];
  const released = [];
  const ctx = context();
  const config = validConfig({
    quarantineContainer: 'recruitment-quarantine',
    cleanContainer: 'recruitment-clean',
    retention: { batchSize: 5 }
  });
  const result = await runRetentionPurge(config, {
    storage: {},
    retention: {
      async claimDueBatch(input) {
        assert.equal(input.limit, 5);
        assert.equal(input.owner, 'worker-1');
        assert.ok(Date.parse(input.leaseExpiresAtUtc) > Date.now());
        return [
          { applicationReference: 'APP-1' },
          { applicationReference: 'APP-2' }
        ];
      },
      async purge(application, storage, containers) {
        assert.deepEqual(containers, {
          quarantine: 'recruitment-quarantine',
          clean: 'recruitment-clean'
        });
        if (application.applicationReference === 'APP-2') {
          throw Object.assign(new Error('storage unavailable'), { code: 'STORAGE_UNAVAILABLE' });
        }
        purged.push(application.applicationReference);
      },
      async release(application, code, retryAtUtc) {
        released.push({ applicationReference: application.applicationReference, code, retryAtUtc });
      }
    }
  }, ctx);

  assert.deepEqual(purged, ['APP-1']);
  assert.equal(released.length, 1);
  assert.equal(released[0].applicationReference, 'APP-2');
  assert.equal(released[0].code, 'STORAGE_UNAVAILABLE');
  assert.ok(Date.parse(released[0].retryAtUtc) > Date.now());
  assert.deepEqual(result, { purged: 1, examined: 2 });
  assert.equal(ctx.warnings.length, 1);
});

test('idempotency cleanup retries each purged application independently', async () => {
  const cleaned = [];
  const ctx = context();
  const result = await runIdempotencyCleanup(validConfig(), {
    retention: {
      async listIdempotencyCleanupCandidates(input) {
        assert.deepEqual(input, { limit: 10 });
        return ['APP-1', 'APP-2', 'APP-3'];
      },
      async cleanupIdempotency(reference) {
        if (reference === 'APP-2') {
          throw Object.assign(new Error('Cosmos unavailable'), { code: 'COSMOS_UNAVAILABLE' });
        }
        cleaned.push(reference);
        return { status: reference === 'APP-3' ? 'current' : 'completed' };
      }
    }
  }, ctx);

  assert.deepEqual(cleaned, ['APP-1', 'APP-3']);
  assert.deepEqual(result, { cleaned: 2, examined: 3 });
  assert.equal(ctx.warnings.length, 1);
  assert.equal(ctx.warnings[0].fields.applicationReference, 'APP-2');
});
