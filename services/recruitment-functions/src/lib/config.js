'use strict';

function bool(value) {
  return String(value || '').toLowerCase() === 'true';
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function commaList(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean))];
}

function originHostnames(origins) {
  const hostnames = [];
  for (const origin of origins || []) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        continue;
      }
      hostnames.push(parsed.hostname.toLowerCase().replace(/\.$/, ''));
    } catch (_) {}
  }
  return [...new Set(hostnames)].sort();
}

function sameStringSet(left, right) {
  return [...new Set(left || [])].sort().join('\n') === [...new Set(right || [])].sort().join('\n');
}

function validShoreVestMailbox(value) {
  if (typeof value !== 'string' || value.length > 254 || /[\s<>\r\n]/.test(value)) return false;
  const match = value.match(/^([^@]+)@([^@]+)$/);
  if (!match || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(match[1])) return false;
  return match[2].toLowerCase() === 'shorevest.com';
}

function validPrivacyNoticeUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    return parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      ['shorevest.com', 'www.shorevest.com'].includes(hostname) &&
      ['/privacy-policy', '/privacy-policy/'].includes(parsed.pathname) &&
      !parsed.search &&
      !parsed.hash;
  } catch (_) {
    return false;
  }
}

function validUtcTimestamp(value) {
  if (value == null || value === '') return true;
  if (typeof value !== 'string' || value.length > 64) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && /Z$/i.test(value.trim());
}

function loadConfig(env = process.env) {
  const environment = env.RECRUITMENT_ENVIRONMENT || 'production';
  const production = environment === 'production' || environment === 'prod';
  const origins = commaList(
    env.RECRUITMENT_ALLOWED_ORIGINS ||
    (production ? 'https://shorevest.com,https://www.shorevest.com' : '')
  );
  const approvedOriginHostnames = originHostnames(origins);
  const candidateMailbox = String(env.RECRUITMENT_CANDIDATE_ACK_MAILBOX || '').trim();

  return {
    apiEnabled: bool(env.RECRUITMENT_API_ENABLED),
    captureOnly: bool(env.RECRUITMENT_CAPTURE_ONLY_MODE),
    environment,
    allowedOrigins: origins,
    requireOrigin: env.RECRUITMENT_REQUIRE_ORIGIN == null ? production : bool(env.RECRUITMENT_REQUIRE_ORIGIN),
    maxBodyBytes: positiveInteger(env.RECRUITMENT_MAX_BODY_BYTES, 65536),
    managedIdentityClientId: env.RECRUITMENT_MANAGED_IDENTITY_CLIENT_ID || env.AZURE_CLIENT_ID,
    cosmosEndpoint: env.RECRUITMENT_COSMOS_ENDPOINT,
    cosmosDatabase: env.RECRUITMENT_COSMOS_DATABASE,
    storageAccountUrl: env.RECRUITMENT_STORAGE_ACCOUNT_URL,
    keyVaultUrl: env.RECRUITMENT_KEYVAULT_URL,
    completionTokenSecretName: env.RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME,
    fingerprintSecretName: env.RECRUITMENT_FINGERPRINT_SECRET_NAME,
    quarantineContainer: env.RECRUITMENT_QUARANTINE_CONTAINER || 'recruitment-quarantine',
    cleanContainer: env.RECRUITMENT_CLEAN_CONTAINER || 'recruitment-clean',
    uploadStorageAccountName: env.RECRUITMENT_UPLOAD_STORAGE_ACCOUNT_NAME,
    rateLimit: {
      enabled: bool(env.RECRUITMENT_RATE_LIMIT_ENABLED),
      limit: positiveInteger(env.RECRUITMENT_RATE_LIMIT_COUNT, 5),
      windowSeconds: positiveInteger(env.RECRUITMENT_RATE_LIMIT_WINDOW_SECONDS, 300)
    },
    botVerification: {
      mode: (env.RECRUITMENT_BOT_VERIFICATION_MODE || 'disabled').toLowerCase(),
      secretName: env.RECRUITMENT_BOT_VERIFICATION_SECRET_NAME,
      endpoint: env.RECRUITMENT_BOT_VERIFICATION_ENDPOINT || 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expectedHostnames: commaList(
        env.RECRUITMENT_BOT_VERIFICATION_HOSTNAME || approvedOriginHostnames.join(',')
      ).map((hostname) => hostname.toLowerCase().replace(/\.$/, '')),
      expectedAction: String(
        env.RECRUITMENT_BOT_VERIFICATION_ACTION || 'recruitment-application'
      ).trim()
    },
    outboxDelivery: {
      enabled: bool(env.RECRUITMENT_OUTBOX_DELIVERY_ENABLED),
      leaseSeconds: positiveInteger(env.RECRUITMENT_OUTBOX_LEASE_SECONDS, 300),
      retrySeconds: positiveInteger(env.RECRUITMENT_OUTBOX_RETRY_SECONDS, 900),
      maxAttempts: positiveInteger(env.RECRUITMENT_OUTBOX_MAX_ATTEMPTS, 10),
      notBeforeUtc: String(env.RECRUITMENT_OUTBOX_NOT_BEFORE_UTC || '').trim()
    },
    graph: {
      endpoint: env.RECRUITMENT_GRAPH_ENDPOINT || 'https://graph.microsoft.com/v1.0'
    },
    sharePoint: {
      siteId: env.RECRUITMENT_SHAREPOINT_SITE_ID,
      applicationsListId: env.RECRUITMENT_APPLICATIONS_LIST_ID,
      filesListId: env.RECRUITMENT_FILES_LIST_ID
    },
    candidateAcknowledgement: {
      enabled: bool(env.RECRUITMENT_CANDIDATE_ACK_ENABLED),
      templateApproved: bool(env.RECRUITMENT_CANDIDATE_ACK_TEMPLATE_APPROVED),
      mailbox: candidateMailbox,
      privacyNoticeUrl: String(
        env.RECRUITMENT_CANDIDATE_ACK_PRIVACY_URL || 'https://shorevest.com/privacy-policy/'
      ).trim()
    },
    teamNotification: {
      enabled: bool(env.RECRUITMENT_TEAM_NOTIFICATION_ENABLED),
      mailbox: String(env.RECRUITMENT_TEAM_NOTIFICATION_MAILBOX || candidateMailbox).trim()
    },
    hrAccess: {
      enabled: bool(env.RECRUITMENT_HR_ACCESS_ENABLED),
      platformAuthenticationEnabled: bool(env.RECRUITMENT_PLATFORM_AUTH_ENABLED),
      requiredRole: env.RECRUITMENT_HR_REQUIRED_ROLE || 'Recruitment.HR',
      readSasSeconds: positiveInteger(env.RECRUITMENT_HR_READ_SAS_SECONDS, 300)
    },
    retention: {
      enabled: bool(env.RECRUITMENT_RETENTION_ENABLED),
      deletionEnabled: bool(env.RECRUITMENT_RETENTION_DELETION_ENABLED),
      platformAuthenticationEnabled: bool(env.RECRUITMENT_PLATFORM_AUTH_ENABLED),
      adminRole: env.RECRUITMENT_RETENTION_ADMIN_ROLE || 'Recruitment.RetentionAdmin',
      policyVersion: env.RECRUITMENT_RETENTION_POLICY_VERSION || '',
      incompleteHours: positiveInteger(env.RECRUITMENT_RETENTION_INCOMPLETE_HOURS, 48),
      submittedDays: positiveInteger(env.RECRUITMENT_RETENTION_SUBMITTED_DAYS, 365),
      maliciousDays: positiveInteger(env.RECRUITMENT_RETENTION_MALICIOUS_DAYS, 30),
      batchSize: positiveInteger(env.RECRUITMENT_RETENTION_BATCH_SIZE, 10),
      leaseSeconds: positiveInteger(env.RECRUITMENT_RETENTION_LEASE_SECONDS, 300),
      retrySeconds: positiveInteger(env.RECRUITMENT_RETENTION_RETRY_SECONDS, 900)
    }
  };
}

function validateConfig(config) {
  const missing = [];
  const invalid = [];

  for (const key of [
    'cosmosEndpoint',
    'cosmosDatabase',
    'storageAccountUrl',
    'keyVaultUrl',
    'completionTokenSecretName',
    'fingerprintSecretName'
  ]) {
    if (!config[key]) missing.push(key);
  }

  if (!Array.isArray(config.allowedOrigins) || config.allowedOrigins.length === 0) {
    invalid.push('allowedOrigins');
  }
  if (!['disabled', 'turnstile'].includes(config.botVerification?.mode)) {
    invalid.push('botVerification.mode');
  }

  // Capture-only keeps destructive lifecycle automation off while allowing
  // explicitly authenticated, role-gated read access to clean documents.
  // Notification delivery and HR reads are non-destructive; retention and
  // deletion remain blocked until the full recruitment lifecycle is launched.
  if (config.captureOnly === true) {
    if (config.retention?.enabled === true) invalid.push('retention.enabled');
    if (config.retention?.deletionEnabled === true) invalid.push('retention.deletionEnabled');
  }

  if (config.outboxDelivery?.enabled === true) {
    if (!config.managedIdentityClientId) missing.push('managedIdentityClientId');
    if (!config.sharePoint?.siteId) missing.push('sharePoint.siteId');
    if (!config.sharePoint?.applicationsListId) missing.push('sharePoint.applicationsListId');
    if (!config.sharePoint?.filesListId) missing.push('sharePoint.filesListId');
    if (!validUtcTimestamp(config.outboxDelivery?.notBeforeUtc)) invalid.push('outboxDelivery.notBeforeUtc');
    if (config.candidateAcknowledgement?.enabled !== true) invalid.push('candidateAcknowledgement.enabled');
    if (config.candidateAcknowledgement?.templateApproved !== true) invalid.push('candidateAcknowledgement.templateApproved');
    if (!config.candidateAcknowledgement?.mailbox) missing.push('candidateAcknowledgement.mailbox');
    else if (!validShoreVestMailbox(config.candidateAcknowledgement.mailbox)) {
      invalid.push('candidateAcknowledgement.mailbox');
    }
    if (!config.candidateAcknowledgement?.privacyNoticeUrl) missing.push('candidateAcknowledgement.privacyNoticeUrl');
    else if (!validPrivacyNoticeUrl(config.candidateAcknowledgement.privacyNoticeUrl)) {
      invalid.push('candidateAcknowledgement.privacyNoticeUrl');
    }
    if (config.teamNotification?.enabled !== true) invalid.push('teamNotification.enabled');
    if (!config.teamNotification?.mailbox) missing.push('teamNotification.mailbox');
    else if (!validShoreVestMailbox(config.teamNotification.mailbox)) {
      invalid.push('teamNotification.mailbox');
    } else if (
      config.candidateAcknowledgement?.mailbox &&
      config.teamNotification.mailbox.toLowerCase() !== config.candidateAcknowledgement.mailbox.toLowerCase()
    ) {
      // The same mailbox is intentionally used for candidate send-as and internal
      // recruitment notifications. Readiness probes this mailbox once, which
      // guarantees both delivery paths use a verified Graph/Exchange target.
      invalid.push('teamNotification.mailbox');
    }
  }

  if (config.hrAccess?.enabled === true) {
    if (config.hrAccess.platformAuthenticationEnabled !== true) invalid.push('hrAccess.platformAuthenticationEnabled');
    if (!config.hrAccess.requiredRole) missing.push('hrAccess.requiredRole');
    if (!Number.isInteger(config.hrAccess.readSasSeconds) || config.hrAccess.readSasSeconds < 60 || config.hrAccess.readSasSeconds > 300) {
      invalid.push('hrAccess.readSasSeconds');
    }
  }

  if (config.retention?.deletionEnabled === true && config.retention?.enabled !== true) {
    invalid.push('retention.enabled');
  }
  if (config.retention?.enabled === true) {
    if (config.retention.platformAuthenticationEnabled !== true) invalid.push('retention.platformAuthenticationEnabled');
    if (!config.retention.adminRole) missing.push('retention.adminRole');
    if (!config.retention.policyVersion) missing.push('retention.policyVersion');
    for (const key of ['incompleteHours', 'submittedDays', 'maliciousDays', 'batchSize', 'leaseSeconds', 'retrySeconds']) {
      if (!Number.isInteger(config.retention[key]) || config.retention[key] <= 0) invalid.push(`retention.${key}`);
    }
    if (config.retention.deletionEnabled === true && config.outboxDelivery?.enabled !== true) {
      invalid.push('outboxDelivery.enabled');
    }
  }

  if (config.apiEnabled) {
    if (!config.managedIdentityClientId) missing.push('managedIdentityClientId');
    if (config.rateLimit?.enabled !== true) invalid.push('rateLimit.enabled');
    if (config.botVerification?.mode !== 'turnstile') invalid.push('botVerification.mode');
    if (!config.botVerification?.secretName) missing.push('botVerification.secretName');
    const expectedHostnames = config.botVerification?.expectedHostnames || [];
    if (!sameStringSet(expectedHostnames, originHostnames(config.allowedOrigins))) {
      invalid.push('botVerification.expectedHostnames');
    }
    if (!/^[a-z0-9_-]{1,64}$/i.test(config.botVerification?.expectedAction || '')) {
      invalid.push('botVerification.expectedAction');
    }
    if (config.captureOnly !== true) {
      if (config.outboxDelivery?.enabled !== true) invalid.push('outboxDelivery.enabled');
      if (config.hrAccess?.enabled !== true) invalid.push('hrAccess.enabled');
      if (config.retention?.enabled !== true) invalid.push('retention.enabled');
      if (config.retention?.deletionEnabled !== true) invalid.push('retention.deletionEnabled');
    }
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing: [...new Set(missing)],
    invalid: [...new Set(invalid)]
  };
}

module.exports = {
  bool,
  positiveInteger,
  commaList,
  originHostnames,
  sameStringSet,
  validShoreVestMailbox,
  validPrivacyNoticeUrl,
  validUtcTimestamp,
  loadConfig,
  validateConfig
};