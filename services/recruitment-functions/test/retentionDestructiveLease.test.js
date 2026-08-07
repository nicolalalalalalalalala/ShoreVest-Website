'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadConfig } = require('../src/lib/config');
const { runRetentionPurge } = require('../src/retention/worker');

function validConfig() {
  return loadConfig({
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
    RECRUITMENT_RETENTION_ADMIN_ROLE: 'Recruitment.RetentionAdmin'
  });
}

test('worker does not release application after any destructive Blob delete starts', async () => {
  let releases = 0;
  let deleteCalls = 0;
  const warnings = [];
  const result = await runRetentionPurge(validConfig(), {
    storage: {
      async delete() {
        deleteCalls += 1;
        return true;
      }
    },
    retention: {
      async claimDueBatch() {
        return [{ applicationReference: 'SV-APP-2026-ABC123' }];
      },
      async purge(application, storage) {
        await storage.delete('recruitment-quarantine', 'source.pdf');
        throw Object.assign(new Error('Cosmos batch failed after Blob deletion'), { code: 503 });
      },
      async release() {
        releases += 1;
      }
    }
  }, {
    invocationId: 'worker-1',
    warn(event, fields) {
      warnings.push({ event, fields });
    }
  });

  assert.equal(deleteCalls, 1);
  assert.equal(releases, 0);
  assert.deepEqual(result, { purged: 0, examined: 1 });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].fields.destructiveStarted, true);
});

test('worker releases lease when failure occurs before any Blob delete', async () => {
  let releases = 0;
  const result = await runRetentionPurge(validConfig(), {
    storage: { async delete() { throw new Error('not expected'); } },
    retention: {
      async claimDueBatch() {
        return [{ applicationReference: 'SV-APP-2026-ABC123' }];
      },
      async purge() {
        throw Object.assign(new Error('lease validation failed'), { code: 'RETENTION_LEASE_INVALID' });
      },
      async release() {
        releases += 1;
      }
    }
  }, { invocationId: 'worker-1', warn() {} });

  assert.equal(releases, 1);
  assert.deepEqual(result, { purged: 0, examined: 1 });
});
