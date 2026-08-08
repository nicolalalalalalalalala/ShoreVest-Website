'use strict';

const { app } = require('@azure/functions');
const { loadConfig, validateConfig } = require('../lib/config');
const { originAllowed, withCors, preflight, readJson, candidate, unavailable, header } = require('../lib/http');
const { createDeps, flows } = require('../appFactory');
const { normalizeEventGridEvent } = require('../lib/eventGrid');

function statusFor(result) {
  if (result.success) return 200;
  if (result.errorCode === 'RATE_LIMITED') return 429;
  if (result.errorCode === 'IDEMPOTENCY_CONFLICT') return 409;
  if (result.errorCode === 'INFRASTRUCTURE_RETRYABLE' || result.errorCode === 'SUBMISSION_IN_PROGRESS') return 503;
  return 400;
}

async function httpFlow(request, context, flow) {
  const config = loadConfig();
  if (request.method === 'OPTIONS') return preflight(request, config);
  if (!config.apiEnabled) return unavailable(request, config);
  if (request.method !== 'POST') return { status: 405, headers: withCors(request, config), jsonBody: { success: false, errorCode: 'METHOD_NOT_ALLOWED' } };
  if (!originAllowed(request, config)) return { status: 403, headers: withCors(request, config), jsonBody: { success: false, errorCode: 'FORBIDDEN' } };

  const parsed = await readJson(request, config);
  if (parsed.error) return { ...parsed.error, headers: withCors(request, config) };

  try {
    const deps = createDeps(config, context);
    const route = request.url || 'recruitment';
    const networkIdentifier = header(request, 'x-forwarded-for') || header(request, 'x-client-ip') || 'unknown';
    const rateLimitKey = `${route}:${networkIdentifier}:${parsed.body.roleId || ''}`;
    parsed.body.__rateLimitKey = rateLimitKey;
    delete parsed.body.__rateLimitKey;
    const result = await flow(parsed.body, deps);
    return { status: statusFor(result), headers: withCors(request, config), jsonBody: candidate(result) };
  } catch (error) {
    context.error('recruitment_http_failed', { code: error.code || 'UNEXPECTED' });
    return { status: 503, headers: withCors(request, config), jsonBody: { success: false, errorCode: 'SERVICE_UNAVAILABLE' } };
  }
}

app.http('initiateApplication', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'recruitment/applications/initiate', handler: (req, ctx) => httpFlow(req, ctx, flows.initiateApplication) });
app.http('completeUpload', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'recruitment/applications/complete', handler: (req, ctx) => httpFlow(req, ctx, flows.completeUpload) });

app.eventGrid('defenderScanResult', { handler: async (event, context) => {
  const config = loadConfig();
  try {
    const normalized = normalizeEventGridEvent(event, config);
    const deps = createDeps(config, context);
    const result = await flows.processScanResult(normalized, deps);
    if (result.errorCode === 'INFRASTRUCTURE_RETRYABLE') throw new Error('retryable scan processing failure');
    return result;
  } catch (error) {
    if (/wrong|malformed|unsupported|unknown/.test(error.message)) {
      context.warn('recruitment_scan_event_rejected', { reason: error.message });
      return undefined;
    }
    throw error;
  }
} });

app.timer('quarantineCleanup', { schedule: '0 */10 * * * *', handler: async (_, context) => {
  const deps = createDeps(loadConfig(), context);
  const batch = await deps.applicationStore.claimCleanupBatch({ limit: 10, owner: context.invocationId, leaseExpiresAtUtc: new Date(Date.now() + 300000).toISOString() });
  for (const file of batch) await flows.retryQuarantineCleanup({ applicationReference: file.applicationReference, fileReference: file.fileReference }, deps);
} });

app.timer('outboxWorker', { schedule: '0 */1 * * * *', handler: async (_, context) => {
  const deps = createDeps(loadConfig(), context);
  const batch = await deps.applicationStore.claimOutboxBatch({ limit: 20, owner: context.invocationId, leaseExpiresAtUtc: new Date(Date.now() + 300000).toISOString() });
  for (const event of batch) {
    try {
      const application = await deps.applicationStore.getApplication(event.applicationReference);
      if (!application) throw new Error('application not found for notification');
      await deps.mailer.sendOutbox(event, application);
      await deps.applicationStore.markOutboxAttempt(event, 'Completed');
      context.log('recruitment_notification_sent', { type: event.type, applicationReference: event.applicationReference });
    } catch (error) {
      context.error('recruitment_notification_failed', { type: event.type, applicationReference: event.applicationReference, code: error.code || error.status || 'SEND_FAILED' });
      try { await deps.applicationStore.markOutboxAttempt(event, 'RetryableFailure'); } catch (markError) {
        context.error('recruitment_notification_retry_state_failed', { applicationReference: event.applicationReference, code: markError.code || markError.statusCode || 'STATE_FAILED' });
      }
    }
  }
} });

app.http('health', { methods: ['GET'], authLevel: 'anonymous', route: 'recruitment/health', handler: async (request) => {
  const config = loadConfig();
  const shape = validateConfig(config);
  return { status: shape.ok ? 200 : 503, headers: withCors(request, config), jsonBody: { ok: shape.ok, runtime: 'active', configuration: shape.ok ? 'valid' : 'invalid', notifications: config.notificationsEnabled ? 'enabled' : 'disabled' } };
} });
