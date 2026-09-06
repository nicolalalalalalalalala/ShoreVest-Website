'use strict';

function bool(value) {
  return String(value || '').toLowerCase() === 'true';
}

function list(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function loadConfig(env = process.env) {
  const environment = env.RECRUITMENT_ENVIRONMENT || 'production';
  const production = environment === 'production';
  const defaultOrigins = production ? 'https://shorevest.com,https://www.shorevest.com' : '';

  return {
    apiEnabled: bool(env.RECRUITMENT_API_ENABLED),
    environment,
    allowedOrigins: list(env.RECRUITMENT_ALLOWED_ORIGINS || defaultOrigins),
    maxBodyBytes: Number(env.RECRUITMENT_MAX_BODY_BYTES || 65536),
    cosmosEndpoint: env.RECRUITMENT_COSMOS_ENDPOINT,
    cosmosDatabase: env.RECRUITMENT_COSMOS_DATABASE,
    storageAccountUrl: env.RECRUITMENT_STORAGE_ACCOUNT_URL,
    keyVaultUrl: env.RECRUITMENT_KEYVAULT_URL,
    completionTokenSecretName: env.RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME,
    fingerprintSecretName: env.RECRUITMENT_FINGERPRINT_SECRET_NAME,
    rateLimitSecretName: env.RECRUITMENT_RATE_LIMIT_SECRET_NAME,
    managedIdentityClientId: env.AZURE_CLIENT_ID || env.RECRUITMENT_MANAGED_IDENTITY_CLIENT_ID,
    quarantineContainer: env.RECRUITMENT_QUARANTINE_CONTAINER || 'recruitment-quarantine',
    cleanContainer: env.RECRUITMENT_CLEAN_CONTAINER || 'recruitment-clean',
    uploadStorageAccountName: env.RECRUITMENT_UPLOAD_STORAGE_ACCOUNT_NAME,
    botVerificationMode: env.RECRUITMENT_BOT_VERIFICATION_MODE || '',
    notificationMailbox: env.RECRUITMENT_NOTIFICATION_MAILBOX || 'careers@shorevest.com',
    notificationsEnabled: env.RECRUITMENT_NOTIFICATIONS_ENABLED == null ? true : bool(env.RECRUITMENT_NOTIFICATIONS_ENABLED),
    rateLimit: {
      enabled: bool(env.RECRUITMENT_RATE_LIMIT_ENABLED),
      allowDisabled: !production || bool(env.RECRUITMENT_RATE_LIMIT_ALLOW_DISABLED),
      limit: Number(env.RECRUITMENT_RATE_LIMIT_COUNT || 5),
      windowSeconds: Number(env.RECRUITMENT_RATE_LIMIT_WINDOW_SECONDS || 300)
    },
    // ClamAV scan worker (Azure Container Apps). The worker drains BlobCreated
    // events for the quarantine container from a Storage Queue and scans each CV
    // against a co-located clamd. See MALWARE_SCANNING_CLAMAV.md.
    scanQueueUrl: env.RECRUITMENT_SCAN_QUEUE_URL,
    clamavHost: env.CLAMAV_HOST || env.RECRUITMENT_CLAMAV_HOST,
    clamavPort: Number(env.CLAMAV_PORT || env.RECRUITMENT_CLAMAV_PORT || 3310),
    clamavTimeoutMs: Number(env.RECRUITMENT_CLAMAV_TIMEOUT_MS || 120000),
    maxScanBytes: Number(env.RECRUITMENT_MAX_SCAN_BYTES || 30 * 1024 * 1024),
    scanMaxDequeue: Number(env.RECRUITMENT_SCAN_MAX_DEQUEUE || 5),
    scanIdleDelayMs: Number(env.RECRUITMENT_SCAN_IDLE_DELAY_MS || 5000),
    scanVisibilityTimeoutSeconds: Number(env.RECRUITMENT_SCAN_VISIBILITY_TIMEOUT_SECONDS || 300)
  };
}

function validateConfig(config) {
  const missing = [];
  for (const key of [
    'cosmosEndpoint',
    'cosmosDatabase',
    'storageAccountUrl',
    'keyVaultUrl',
    'completionTokenSecretName',
    'fingerprintSecretName',
    'rateLimitSecretName',
    'notificationMailbox'
  ]) {
    if (!config[key]) missing.push(key);
  }
  return { ok: missing.length === 0, missing };
}

module.exports = { loadConfig, validateConfig };
