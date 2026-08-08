'use strict';

const crypto = require('node:crypto');
const { DefaultAzureCredential, ManagedIdentityCredential } = require('@azure/identity');
const {
  initiateApplication,
  completeUpload,
  processScanResult,
  retryQuarantineCleanup
} = require('../../../api/recruitment/core/flows');
const { loadConfig } = require('./lib/config');
const { loadManifest } = require('./lib/manifest');
const { createCosmosAdapters } = require('./adapters/cosmos');
const { createBlobAdapter } = require('./adapters/blob');
const { createSecretProvider, createTokenAdapter, createFingerprintAdapter } = require('./adapters/secrets');
const { createMailer } = require('./lib/mailer');

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex').toUpperCase();
}

function createCredential(cfg) {
  if (cfg.managedIdentityClientId) {
    return new ManagedIdentityCredential(cfg.managedIdentityClientId);
  }
  return new DefaultAzureCredential({ managedIdentityClientId: cfg.managedIdentityClientId });
}

function createLogger(context) {
  return {
    async log(operation, fields = {}) {
      const safeFields = {
        operation,
        correlationId: fields.correlationId,
        applicationReference: fields.applicationReference,
        fileReference: fields.fileReference,
        roleId: fields.roleId,
        errorCode: fields.errorCode,
        durationMs: fields.durationMs,
        classification: fields.classification
      };
      Object.keys(safeFields).forEach((key) => safeFields[key] === undefined && delete safeFields[key]);
      (context?.log || console.log)('recruitment_operation', safeFields);
    }
  };
}

function createBotVerifier(cfg) {
  const bypass = cfg.botVerificationMode === 'test-bypass';
  if (bypass && cfg.environment !== 'production') {
    return { async verify() { return { ok: true }; } };
  }
  if (cfg.apiEnabled && (!cfg.botVerificationMode || cfg.botVerificationMode === 'test-bypass')) {
    return { async verify() { return { ok: false, errorCode: 'INTERNAL_CONFIGURATION_ERROR' }; } };
  }
  return { async verify() { return { ok: false, errorCode: 'INTERNAL_CONFIGURATION_ERROR' }; } };
}

function createDeps(cfg = loadConfig(), context) {
  const credential = createCredential(cfg);
  const cosmos = createCosmosAdapters({ endpoint: cfg.cosmosEndpoint, databaseId: cfg.cosmosDatabase, credential });
  const secrets = createSecretProvider({ vaultUrl: cfg.keyVaultUrl, credential });
  const storage = createBlobAdapter({
    accountUrl: cfg.storageAccountUrl,
    credential,
    containers: { quarantine: cfg.quarantineContainer, clean: cfg.cleanContainer }
  });

  return {
    ...cosmos,
    storage,
    sas: storage,
    mailer: createMailer({
      credential,
      mailbox: cfg.notificationMailbox,
      enabled: cfg.notificationsEnabled
    }),
    tokens: createTokenAdapter(secrets, cfg.completionTokenSecretName),
    fingerprints: createFingerprintAdapter(secrets, cfg.fingerprintSecretName),
    now: async () => new Date(),
    loadManifest: async () => loadManifest(),
    botVerifier: createBotVerifier(cfg),
    references: {
      async application() { return `SV-APP-${new Date().getUTCFullYear()}-${randomHex(8)}`; },
      async file() { return `SV-FILE-${randomHex(8)}`; },
      async tokenId() { return crypto.randomUUID(); }
    },
    logger: createLogger(context)
  };
}

module.exports = {
  createDeps,
  flows: { initiateApplication, completeUpload, processScanResult, retryQuarantineCleanup }
};
