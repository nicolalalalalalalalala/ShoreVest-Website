'use strict';

const { validateConfig } = require('../lib/config');

function configurationReady(config, context, operation) {
  const shape = validateConfig(config);
  if (shape.ok) return true;
  context?.warn?.('recruitment_retention_configuration_invalid', {
    operation,
    missingCount: shape.missing.length,
    invalidCount: shape.invalid.length
  });
  return false;
}

async function runPolicyAssignment(config, dependencies, context) {
  if (config.retention?.enabled !== true) return { assigned: 0, skipped: true };
  if (!configurationReady(config, context, 'policy-assignment')) {
    return { assigned: 0, skipped: true, reason: 'CONFIGURATION_INVALID' };
  }
  const candidates = await dependencies.retention.listPolicyCandidates({
    limit: config.retention.batchSize,
    policyVersion: config.retention.policyVersion
  });
  let assigned = 0;
  for (const applicationReference of candidates) {
    try {
      const result = await dependencies.retention.applyPolicy(applicationReference, config.retention);
      if (result.status === 'updated') assigned += 1;
    } catch (error) {
      context?.warn?.('recruitment_retention_policy_assignment_failed', {
        applicationReference,
        code: error.code || 'RETENTION_POLICY_FAILED'
      });
    }
  }
  return { assigned, examined: candidates.length };
}

async function runRetentionPurge(config, dependencies, context) {
  if (config.retention?.enabled !== true || config.retention?.deletionEnabled !== true) {
    return { purged: 0, skipped: true };
  }
  if (!configurationReady(config, context, 'purge')) {
    return { purged: 0, skipped: true, reason: 'CONFIGURATION_INVALID' };
  }
  const now = Date.now();
  const batch = await dependencies.retention.claimDueBatch({
    limit: config.retention.batchSize,
    owner: context?.invocationId || 'retention-worker',
    leaseExpiresAtUtc: new Date(now + config.retention.leaseSeconds * 1000).toISOString()
  });
  let purged = 0;
  for (const application of batch) {
    let destructiveStarted = false;
    const guardedStorage = {
      async delete(container, path) {
        destructiveStarted = true;
        return dependencies.storage.delete(container, path);
      }
    };
    try {
      await dependencies.retention.purge(application, guardedStorage, {
        quarantine: config.quarantineContainer,
        clean: config.cleanContainer
      });
      purged += 1;
    } catch (error) {
      if (!destructiveStarted) {
        const retryAtUtc = new Date(Date.now() + config.retention.retrySeconds * 1000).toISOString();
        try {
          await dependencies.retention.release(
            application,
            error.code || 'RETENTION_PURGE_FAILED',
            retryAtUtc
          );
        } catch (_) {}
      }
      context?.warn?.('recruitment_retention_purge_failed', {
        applicationReference: application.applicationReference,
        code: error.code || 'RETENTION_PURGE_FAILED',
        destructiveStarted
      });
    }
  }
  return { purged, examined: batch.length };
}

async function runIdempotencyCleanup(config, dependencies, context) {
  if (config.retention?.enabled !== true || config.retention?.deletionEnabled !== true) {
    return { cleaned: 0, skipped: true };
  }
  if (!configurationReady(config, context, 'idempotency-cleanup')) {
    return { cleaned: 0, skipped: true, reason: 'CONFIGURATION_INVALID' };
  }
  const candidates = await dependencies.retention.listIdempotencyCleanupCandidates({
    limit: config.retention.batchSize
  });
  let cleaned = 0;
  for (const applicationReference of candidates) {
    try {
      const result = await dependencies.retention.cleanupIdempotency(applicationReference);
      if (result.status === 'completed' || result.status === 'current') cleaned += 1;
    } catch (error) {
      context?.warn?.('recruitment_retention_idempotency_cleanup_failed', {
        applicationReference,
        code: error.code || 'IDEMPOTENCY_CLEANUP_FAILED'
      });
    }
  }
  return { cleaned, examined: candidates.length };
}

module.exports = {
  configurationReady,
  runPolicyAssignment,
  runRetentionPurge,
  runIdempotencyCleanup
};
