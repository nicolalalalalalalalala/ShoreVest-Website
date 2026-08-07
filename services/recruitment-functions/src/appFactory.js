'use strict';

const crypto = require('crypto');
const { DefaultAzureCredential } = require('@azure/identity');
const {
  initiateApplication: coreInitiateApplication,
  completeUpload,
  finalizeApplication: coreFinalizeApplication,
  processScanResult: coreProcessScanResult,
  retryQuarantineCleanup
} = require('../../../api/recruitment/core/flows');
const { createInitiateApplication } = require('./flows/initiateApplication');
const { createFinalizeApplication } = require('./flows/finalizeApplication');
const { createProcessScanResult } = require('./flows/processScanResult');
const { loadConfig } = require('./lib/config');
const { loadManifest } = require('./lib/manifest');
const { createStructuredLogger } = require('./lib/logger');
const { createCosmosAdapters } = require('./adapters/cosmos');
const { createProjectionReader } = require('./adapters/projectionReader');
const { createOutboxCheckpointStore } = require('./adapters/outboxCheckpoint');
const { createOutboxReader } = require('./adapters/outboxReader');
const { secureIdempotencyAdapter } = require('./adapters/idempotencySecurity');
const { createRetentionAdapter } = require('./adapters/retention');
const { createBlobAdapter } = require('./adapters/blob');
const {
  createSecretProvider,
  createTokenAdapter,
  createFingerprintAdapter
} = require('./adapters/secrets');
const { createBotVerifier } = require('./adapters/bot');
const { createRateLimiter } = require('./adapters/rateLimit');
const { createGraphAdapter } = require('./adapters/graph');
const { createOutboxDispatcher } = require('./outbox/dispatcher');
const { createFinalizationGatedDispatcher } = require('./outbox/finalizationGate');

const initiateApplication = createInitiateApplication(coreInitiateApplication);
const finalizeApplication = createFinalizeApplication(coreFinalizeApplication);
const processScanResult = createProcessScanResult(coreProcessScanResult);

function randomHex(length) {
  return crypto.randomUUID().replace(/-/g, '').slice(0, length).toUpperCase();
}

function createDeps(config = loadConfig(), requestContext = {}) {
  const credentialOptions = config.managedIdentityClientId
    ? { managedIdentityClientId: config.managedIdentityClientId }
    : {};
  const credential = new DefaultAzureCredential(credentialOptions);
  const secretProvider = createSecretProvider({ vaultUrl: config.keyVaultUrl, credential });
  const fingerprints = createFingerprintAdapter(secretProvider, config.fingerprintSecretName);
  const cosmos = createCosmosAdapters({
    endpoint: config.cosmosEndpoint,
    databaseId: config.cosmosDatabase,
    credential
  });
  const projectionReader = createProjectionReader({
    endpoint: config.cosmosEndpoint,
    databaseId: config.cosmosDatabase,
    credential
  });
  const outboxCheckpoint = createOutboxCheckpointStore({
    endpoint: config.cosmosEndpoint,
    databaseId: config.cosmosDatabase,
    credential
  });
  const outboxReader = createOutboxReader({
    endpoint: config.cosmosEndpoint,
    databaseId: config.cosmosDatabase,
    credential
  });
  const retention = createRetentionAdapter({
    endpoint: config.cosmosEndpoint,
    databaseId: config.cosmosDatabase,
    credential
  });
  const storage = createBlobAdapter({
    accountUrl: config.storageAccountUrl,
    credential,
    containers: {
      quarantine: config.quarantineContainer,
      clean: config.cleanContainer
    }
  });
  const graph = config.outboxDelivery.enabled === true
    ? createGraphAdapter({ credential, endpoint: config.graph.endpoint })
    : null;
  const baseOutboxDispatcher = graph
    ? createOutboxDispatcher({ graph, config })
    : null;
  const outboxDispatcher = baseOutboxDispatcher
    ? createFinalizationGatedDispatcher(baseOutboxDispatcher)
    : null;

  return {
    ...cosmos,
    idempotency: secureIdempotencyAdapter(cosmos.idempotency),
    projectionReader,
    outboxCheckpoint,
    outboxReader,
    retention,
    storage,
    sas: storage,
    secretProvider,
    tokens: createTokenAdapter(secretProvider, config.completionTokenSecretName),
    fingerprints,
    rateLimiter: createRateLimiter({
      endpoint: config.cosmosEndpoint,
      databaseId: config.cosmosDatabase,
      credential,
      enabled: config.rateLimit.enabled,
      limit: config.rateLimit.limit,
      windowSeconds: config.rateLimit.windowSeconds,
      fingerprint: fingerprints,
      requestContext
    }),
    botVerifier: createBotVerifier({
      mode: config.botVerification.mode,
      environment: config.environment,
      secretProvider,
      secretName: config.botVerification.secretName,
      endpoint: config.botVerification.endpoint,
      expectedHostnames: config.botVerification.expectedHostnames,
      expectedAction: config.botVerification.expectedAction
    }),
    graph,
    outboxDispatcher,
    now: async () => new Date(),
    loadManifest: async () => loadManifest(),
    references: {
      async application() {
        return `SV-APP-${new Date().getUTCFullYear()}-${randomHex(16)}`;
      },
      async file() {
        return `SV-FILE-${randomHex(16)}`;
      },
      async tokenId() {
        return crypto.randomUUID();
      }
    },
    logger: createStructuredLogger()
  };
}

module.exports = {
  randomHex,
  createDeps,
  flows: {
    initiateApplication,
    completeUpload,
    finalizeApplication,
    processScanResult,
    retryQuarantineCleanup
  }
};
