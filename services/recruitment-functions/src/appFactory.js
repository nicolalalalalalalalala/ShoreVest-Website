'use strict';

const crypto = require('crypto');
const { DefaultAzureCredential } = require('@azure/identity');
const { NOTIFICATION_EVENTS: EVENTS } = require('../../../api/recruitment/core/constants');
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
const ACKNOWLEDGEMENT_PROPERTY_MARKER = 'ShoreVestApplicationReference';
const TEAM_NOTIFICATION_PROPERTY_MARKER = 'ShoreVestRecruitmentTeamApplicationReference';
const SHOREVEST_LOGO_URL = 'https://shorevest.com/assets/brand/sv-lockup-fc-dark.png';
const LEGACY_NOTIFICATION_FIELDS = Object.freeze([
  'NotificationState',
  'NotificationEventKey',
  'NotificationSentAtUtc',
  'NotificationAttemptCount',
  'NotificationLastErrorCode'
]);
const DEFAULT_TEAM_NOTIFICATION_RECIPIENTS = Object.freeze([
  'careers@shorevest.com',
  'hr@shorevest.com'
]);

function randomHex(length) {
  return crypto.randomUUID().replace(/-/g, '').slice(0, length).toUpperCase();
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function teamNotificationRecipients(env = process.env) {
  const configured = String(env.RECRUITMENT_TEAM_NOTIFICATION_RECIPIENTS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length > 0
    ? [...new Set(configured)]
    : [...DEFAULT_TEAM_NOTIFICATION_RECIPIENTS];
}

function acknowledgementRole(subject, chinese) {
  const parts = String(subject || '')
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean);
  if (parts.length >= 3 && parts[1]) return parts[1];
  return chinese ? '该职位' : 'this role';
}

function candidateAcknowledgementMessage(message, extendedProperty) {
  const subject = String(message?.subject || '');
  const chinese = /^\s*申请已收到/.test(subject);
  const role = escapeHtml(acknowledgementRole(subject, chinese));
  const reference = escapeHtml(extendedProperty?.value || '');
  const logoUrl = escapeHtml(SHOREVEST_LOGO_URL);
  const privacyUrl = 'https://shorevest.com/privacy-policy/';
  const siteUrl = 'https://shorevest.com/';

  const copy = chinese
    ? {
      preheader: `我们已收到您对 ${role} 职位的申请。`,
      heading: '申请已收到',
      received: `感谢您对 ShoreVest 的关注。我们已收到您对 <strong>${role}</strong> 职位的申请。`,
      next: '招聘团队将审核您的申请材料。如您的经验与职位要求相符，我们将与您联系并告知后续安排。',
      reference: '申请编号',
      retain: '请保留此申请编号，以备后续查询。',
      privacy: '隐私政策',
      footer: 'ShoreVest Careers'
    }
    : {
      preheader: `We have received your application for the ${role} position.`,
      heading: 'Application received',
      received: `Thank you for your interest in ShoreVest. We have received your application for the <strong>${role}</strong> position.`,
      next: 'Our recruitment team will review your application. If your experience aligns with the role, a member of our team will contact you regarding next steps.',
      reference: 'Application reference',
      retain: 'Please retain this reference for your records.',
      privacy: 'Privacy Policy',
      footer: 'ShoreVest Careers'
    };

  const referenceBlock = reference
    ? `<tr>
        <td style="padding:20px 0 0 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background:#f4f0e7;">
            <tr>
              <td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;color:#24343b;">
                <div style="font-size:11px;line-height:1.4;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#566f66;">${copy.reference}</div>
                <div style="padding-top:5px;font-size:15px;line-height:1.5;word-break:break-word;">${reference}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const content = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#24343b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${copy.preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#ffffff;">
    <tr>
      <td align="center" style="padding:32px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#24343b;">
          <tr>
            <td style="padding:0 0 20px 0;">
              <a href="${siteUrl}" style="text-decoration:none;">
                <img src="${logoUrl}" width="172" alt="ShoreVest" style="display:block;width:172px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
              </a>
            </td>
          </tr>
          <tr>
            <td style="height:2px;line-height:2px;font-size:0;background:#c64832;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:30px 0 0 0;">
              <h1 style="margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:1.2;font-weight:600;color:#24343b;">${copy.heading}</h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:#24343b;">${copy.received}</p>
              <p style="margin:0;font-size:16px;line-height:1.65;color:#24343b;">${copy.next}</p>
            </td>
          </tr>
          ${referenceBlock}
          <tr>
            <td style="padding:18px 0 0 0;font-size:13px;line-height:1.6;color:#657078;">${copy.retain}</td>
          </tr>
          <tr>
            <td style="padding:28px 0 0 0;border-top:1px solid #dedbd3;font-size:13px;line-height:1.65;color:#657078;">
              <div>${copy.footer}</div>
              <div style="padding-top:4px;"><a href="${privacyUrl}" style="color:#566f66;text-decoration:underline;">${copy.privacy}</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${siteUrl}" style="color:#566f66;text-decoration:none;">shorevest.com</a></div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    ...message,
    body: { contentType: 'HTML', content }
  };
}

function withoutLegacyNotificationFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return fields;
  const cleaned = { ...fields };
  for (const field of LEGACY_NOTIFICATION_FIELDS) delete cleaned[field];
  return cleaned;
}

function createRecruitmentGraph(graph, env = process.env) {
  if (!graph) return null;
  const recipients = teamNotificationRecipients(env);
  const wrapped = {
    ...graph,
    createDraftMessage(mailbox, message, extendedProperty) {
      const propertyId = String(extendedProperty?.id || '');
      const internalNotification = propertyId.includes(TEAM_NOTIFICATION_PROPERTY_MARKER);
      const candidateAcknowledgement =
        !internalNotification && propertyId.includes(ACKNOWLEDGEMENT_PROPERTY_MARKER);

      if (internalNotification) {
        return graph.createDraftMessage(
          mailbox,
          {
            ...message,
            toRecipients: recipients.map((address) => ({ emailAddress: { address } }))
          },
          extendedProperty
        );
      }

      if (candidateAcknowledgement) {
        return graph.createDraftMessage(
          mailbox,
          candidateAcknowledgementMessage(message, extendedProperty),
          extendedProperty
        );
      }

      return graph.createDraftMessage(mailbox, message, extendedProperty);
    }
  };

  if (typeof graph.upsertListItem === 'function') {
    wrapped.upsertListItem = function upsertListItem(options) {
      return graph.upsertListItem({
        ...options,
        fields: withoutLegacyNotificationFields(options?.fields)
      });
    };
  }

  return wrapped;
}

function createNotificationFirstDispatcher(dispatcher) {
  if (!dispatcher || typeof dispatcher.deliver !== 'function') return dispatcher;
  if (typeof dispatcher.notifyTeam !== 'function' || typeof dispatcher.project !== 'function') return dispatcher;

  return {
    ...dispatcher,
    async deliver(event, dependencies) {
      if (event?.type !== EVENTS.ApplicationReceived) {
        return dispatcher.deliver(event, dependencies);
      }

      // Internal notification is operationally critical and must not be blocked by
      // a transient SharePoint projection failure. notifyTeam is idempotent: it
      // reconciles the deterministic tagged draft/sent message on every retry.
      const teamDelivery = await dispatcher.notifyTeam(event, dependencies);
      const projection = await dispatcher.project(event, dependencies);
      if (projection.skipped) return projection;
      return {
        deliveryReference: `${teamDelivery.deliveryReference}|${projection.deliveryReference}`,
        event: teamDelivery.event || event,
        reconciled: teamDelivery.reconciled === true
      };
    }
  };
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
  const baseGraph = config.outboxDelivery.enabled === true
    ? createGraphAdapter({ credential, endpoint: config.graph.endpoint })
    : null;
  const graph = createRecruitmentGraph(baseGraph);
  const baseOutboxDispatcher = graph
    ? createOutboxDispatcher({ graph, config })
    : null;
  const notificationFirstDispatcher = createNotificationFirstDispatcher(baseOutboxDispatcher);
  const outboxDispatcher = notificationFirstDispatcher
    ? createFinalizationGatedDispatcher(notificationFirstDispatcher)
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
  ACKNOWLEDGEMENT_PROPERTY_MARKER,
  TEAM_NOTIFICATION_PROPERTY_MARKER,
  SHOREVEST_LOGO_URL,
  LEGACY_NOTIFICATION_FIELDS,
  DEFAULT_TEAM_NOTIFICATION_RECIPIENTS,
  randomHex,
  teamNotificationRecipients,
  acknowledgementRole,
  candidateAcknowledgementMessage,
  withoutLegacyNotificationFields,
  createRecruitmentGraph,
  createNotificationFirstDispatcher,
  createDeps,
  flows: {
    initiateApplication,
    completeUpload,
    finalizeApplication,
    processScanResult,
    retryQuarantineCleanup
  }
};
