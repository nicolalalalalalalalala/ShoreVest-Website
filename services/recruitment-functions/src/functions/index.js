'use strict';

const { app } = require('@azure/functions');
const { loadConfig, validateConfig } = require('../lib/config');
const { createReadinessProbe } = require('../lib/readiness');
const { safeErrorCode } = require('../lib/logger');
const { deliverDefenderScanEvent } = require('../lib/scanDelivery');
const { applyEndpointRateLimit } = require('../lib/endpointRateLimit');
const { RATE_LIMIT_SCOPES } = require('../adapters/rateLimit');
const {
  originAllowed,
  withCors,
  preflightResponse,
  readJson,
  requestContext,
  unavailable
} = require('../lib/http');
const { flowHttpResponse } = require('../lib/flowResponse');
const { createDeps, flows } = require('../appFactory');
const { accessCleanDocument } = require('../hr/documentAccess');
const { updateRetentionControl } = require('../hr/retentionControl');
const {
  runPolicyAssignment,
  runRetentionPurge,
  runIdempotencyCleanup
} = require('../retention/worker');

const readinessProbe = createReadinessProbe();

function configurationUnavailable(req, config, context, operation) {
  const shape = validateConfig(config);
  if (shape.ok) return null;
  context?.error?.('recruitment_configuration_invalid', {
    operation,
    missingCount: shape.missing.length,
    invalidCount: shape.invalid.length
  });
  return {
    status: 503,
    headers: withCors(req, config),
    jsonBody: { success: false, errorCode: 'SUBMISSION_FAILED' }
  };
}

async function httpFlow(req, context, flow, options = {}) {
  const config = loadConfig();
  if (!config.apiEnabled) return unavailable(req, config);
  if (req.method === 'OPTIONS') return preflightResponse(req, config);

  const invalidConfiguration = configurationUnavailable(req, config, context, 'public-api');
  if (invalidConfiguration) return invalidConfiguration;
  if (req.method !== 'POST') {
    return {
      status: 405,
      headers: withCors(req, config),
      jsonBody: { success: false, errorCode: 'METHOD_NOT_ALLOWED' }
    };
  }
  if (!originAllowed(req, config)) {
    return {
      status: 403,
      headers: withCors(req, config),
      jsonBody: { success: false, errorCode: 'FORBIDDEN' }
    };
  }

  const trustedContext = requestContext(req);
  try {
    const dependencies = createDeps(config, trustedContext);
    const rateLimit = await applyEndpointRateLimit({
      req,
      config,
      dependencies,
      scope: options.rateLimitScope,
      reuseForCoreInitiation: options.rateLimitScope === RATE_LIMIT_SCOPES.initiate
    });
    if (rateLimit.allowed !== true) return rateLimit.response;

    const parsed = await readJson(req, config);
    if (parsed.error) {
      return {
        status: parsed.error.status,
        headers: withCors(req, config),
        jsonBody: parsed.error.body
      };
    }
    if (!parsed.body || typeof parsed.body !== 'object' || Array.isArray(parsed.body)) {
      return {
        status: 400,
        headers: withCors(req, config),
        jsonBody: { success: false, errorCode: 'VALIDATION_FAILED' }
      };
    }

    if (options.attachRequestContext === true) {
      parsed.body._requestContext = trustedContext;
    }

    const result = await flow(parsed.body, dependencies);
    return flowHttpResponse(req, config, result);
  } catch (error) {
    context.error('recruitment_http_failed', { code: safeErrorCode(error) });
    return {
      status: 500,
      headers: withCors(req, config),
      jsonBody: { success: false, errorCode: 'SUBMISSION_FAILED' }
    };
  }
}

app.http('initiateApplication', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'recruitment/applications/initiate',
  handler: (req, context) => httpFlow(req, context, flows.initiateApplication, {
    attachRequestContext: true,
    rateLimitScope: RATE_LIMIT_SCOPES.initiate
  })
});

app.http('completeUpload', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'recruitment/applications/complete',
  handler: (req, context) => httpFlow(req, context, flows.completeUpload, {
    rateLimitScope: RATE_LIMIT_SCOPES.complete
  })
});

app.http('finalizeApplication', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'recruitment/applications/finalize',
  handler: (req, context) => httpFlow(req, context, flows.finalizeApplication, {
    rateLimitScope: RATE_LIMIT_SCOPES.finalize
  })
});

app.http('hrCleanDocumentAccess', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'recruitment/hr/applications/{applicationReference}/files/{fileReference}/access',
  handler: async (req, context) => {
    const config = loadConfig();
    try {
      const dependencies = createDeps(config);
      const result = await accessCleanDocument(req, config, dependencies);
      return { ...result, headers: withCors(req, config) };
    } catch (error) {
      context.error('recruitment_hr_document_access_failed', { code: safeErrorCode(error) });
      return {
        status: 500,
        headers: withCors(req, config),
        jsonBody: { success: false, errorCode: 'HR_DOCUMENT_ACCESS_FAILED' }
      };
    }
  }
});

app.http('hrRetentionControl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'recruitment/hr/applications/{applicationReference}/retention',
  handler: async (req, context) => {
    const config = loadConfig();
    const parsed = await readJson(req, config);
    if (parsed.error) {
      return {
        status: parsed.error.status,
        headers: withCors(req, config),
        jsonBody: parsed.error.body
      };
    }
    if (!parsed.body || typeof parsed.body !== 'object' || Array.isArray(parsed.body)) {
      return {
        status: 400,
        headers: withCors(req, config),
        jsonBody: { success: false, errorCode: 'RETENTION_CONTROL_INVALID' }
      };
    }
    try {
      const dependencies = createDeps(config);
      const result = await updateRetentionControl(req, config, dependencies, parsed.body);
      return { ...result, headers: withCors(req, config) };
    } catch (error) {
      context.error('recruitment_retention_control_failed', { code: safeErrorCode(error) });
      return {
        status: 500,
        headers: withCors(req, config),
        jsonBody: { success: false, errorCode: 'RETENTION_CONTROL_FAILED' }
      };
    }
  }
});

app.eventGrid('defenderScanResult', {
  handler: async (event, context) => deliverDefenderScanEvent({
    event,
    context,
    config: loadConfig(),
    createDependencies: createDeps,
    processScanResult: flows.processScanResult
  })
});

app.timer('quarantineCleanup', {
  schedule: '0 */10 * * * *',
  handler: async (_, context) => {
    const dependencies = createDeps(loadConfig());
    const batch = await dependencies.applicationStore.claimCleanupBatch({
      limit: 10,
      owner: context.invocationId,
      leaseExpiresAtUtc: new Date(Date.now() + 300000).toISOString()
    });
    for (const file of batch) {
      await flows.retryQuarantineCleanup({ fileReference: file.fileReference }, dependencies);
    }
  }
});

app.timer('retentionPolicyAssignment', {
  schedule: '0 15 * * * *',
  handler: async (_, context) => {
    const config = loadConfig();
    if (config.retention.enabled !== true) {
      context.log('recruitment_retention_disabled');
      return;
    }
    await runPolicyAssignment(config, createDeps(config), context);
  }
});

app.timer('retentionPurge', {
  schedule: '0 45 * * * *',
  handler: async (_, context) => {
    const config = loadConfig();
    if (config.retention.enabled !== true || config.retention.deletionEnabled !== true) {
      context.log('recruitment_retention_deletion_disabled');
      return;
    }
    await runRetentionPurge(config, createDeps(config), context);
  }
});

app.timer('retentionIdempotencyCleanup', {
  schedule: '0 55 * * * *',
  handler: async (_, context) => {
    const config = loadConfig();
    if (config.retention.enabled !== true || config.retention.deletionEnabled !== true) {
      context.log('recruitment_retention_cleanup_disabled');
      return;
    }
    await runIdempotencyCleanup(config, createDeps(config), context);
  }
});

app.timer('outboxWorker', {
  schedule: '0 */5 * * * *',
  handler: async (_, context) => {
    const config = loadConfig();
    if (config.outboxDelivery.enabled !== true) {
      context.log('recruitment_outbox_delivery_disabled');
      return;
    }
    const shape = validateConfig(config);
    if (!shape.ok) {
      context.error('recruitment_outbox_configuration_invalid', {
        missingCount: shape.missing.length,
        invalidCount: shape.invalid.length
      });
      return;
    }

    const dependencies = createDeps(config);
    if (!dependencies.outboxDispatcher || typeof dependencies.outboxDispatcher.deliver !== 'function') {
      throw Object.assign(new Error('Recruitment outbox dispatcher is not configured'), {
        code: 'INTERNAL_CONFIGURATION_ERROR'
      });
    }

    const now = Date.now();
    const batch = await dependencies.applicationStore.claimOutboxBatch({
      limit: 10,
      owner: context.invocationId,
      leaseExpiresAtUtc: new Date(now + config.outboxDelivery.leaseSeconds * 1000).toISOString()
    });

    for (const event of batch) {
      try {
        const delivery = await dependencies.outboxDispatcher.deliver(event, dependencies);
        const durableEvent = delivery?.event || event;
        await dependencies.applicationStore.completeOutboxEvent(durableEvent, delivery || {});
      } catch (error) {
        const durableEvent = error.event || event;
        if ((durableEvent.attemptCount || 0) >= config.outboxDelivery.maxAttempts || error.permanent === true) {
          await dependencies.applicationStore.failOutboxEvent(
            durableEvent,
            safeErrorCode(error, 'DELIVERY_FAILED')
          );
          continue;
        }
        const providerDelay = Number(error.retryAfterMs || 0);
        const retryDelay = Math.max(
          config.outboxDelivery.retrySeconds * 1000,
          Number.isFinite(providerDelay) ? providerDelay : 0
        );
        await dependencies.applicationStore.retryOutboxEvent(
          durableEvent,
          safeErrorCode(error, 'DELIVERY_RETRYABLE'),
          new Date(Date.now() + retryDelay).toISOString()
        );
      }
    }
  }
});

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'recruitment/health',
  handler: async (req) => {
    const config = loadConfig();
    const shape = validateConfig(config);
    let result;
    try {
      const dependencies = shape.ok ? createDeps(config) : null;
      result = await readinessProbe(config, dependencies);
    } catch (_) {
      result = {
        ok: false,
        runtime: 'active',
        configuration: shape.ok ? 'valid' : 'invalid',
        dependencies: shape.ok ? 'unavailable' : 'not-checked'
      };
    }
    return {
      status: result.ok ? 200 : 503,
      headers: withCors(req, config),
      jsonBody: result
    };
  }
});

module.exports = {
  configurationUnavailable,
  httpFlow
};
