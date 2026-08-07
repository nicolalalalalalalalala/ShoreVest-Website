'use strict';

const RATE_LIMIT_SCOPES = Object.freeze({
  initiate: 'application-initiate',
  complete: 'upload-complete',
  finalize: 'application-finalize'
});

const SCOPE_PREFIXES = Object.freeze({
  [RATE_LIMIT_SCOPES.initiate]: 'init',
  [RATE_LIMIT_SCOPES.complete]: 'complete',
  [RATE_LIMIT_SCOPES.finalize]: 'finalize'
});

function errorCode(error) {
  return error?.code || error?.statusCode;
}

function validScope(scope) {
  return Object.prototype.hasOwnProperty.call(SCOPE_PREFIXES, scope);
}

function createRateLimiter({
  endpoint,
  databaseId,
  credential,
  client,
  enabled = false,
  limit = 5,
  windowSeconds = 300,
  fingerprint,
  requestContext = {},
  now = () => new Date()
} = {}) {
  const cosmosClient = client || (
    endpoint && credential
      ? new (require('@azure/cosmos').CosmosClient)({ endpoint, aadCredentials: credential })
      : null
  );
  const container = cosmosClient?.database(databaseId).container('rateLimits');

  async function checkScope(scope) {
    if (!validScope(scope)) {
      const error = new Error('rate limit scope is invalid');
      error.code = 'INTERNAL_CONFIGURATION_ERROR';
      throw error;
    }
    if (!enabled) return { allowed: true, scope };
    if (!container || !fingerprint || typeof fingerprint.hmac !== 'function') {
      const error = new Error('rate limiter unavailable');
      error.code = 'INTERNAL_CONFIGURATION_ERROR';
      throw error;
    }

    const identity = {
      clientIp: requestContext.clientIp || 'unknown-app-service-client'
    };
    const digest = await fingerprint.hmac(JSON.stringify({ scope, identity }));
    const currentTime = now();
    const nowSeconds = Math.floor(currentTime.getTime() / 1000);
    const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
    const windowEnd = windowStart + windowSeconds;
    const key = `${SCOPE_PREFIXES[scope]}:${digest}:${windowStart}`;
    const retryAfterMs = Math.max(1000, (windowEnd - nowSeconds) * 1000);
    const initial = {
      id: key,
      key,
      docType: 'rateLimit',
      scope,
      count: 1,
      windowStartUtc: new Date(windowStart * 1000).toISOString(),
      windowEndUtc: new Date(windowEnd * 1000).toISOString(),
      ttl: windowSeconds + 60
    };

    try {
      await container.items.create(initial);
      return {
        allowed: true,
        scope,
        remaining: Math.max(0, limit - 1),
        retryAfterMs: 0
      };
    } catch (error) {
      if (errorCode(error) !== 409) throw error;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await container.item(key, key).read();
      const record = response?.resource;
      if (!record) continue;
      if (record.scope && record.scope !== scope) {
        const error = new Error('rate limit scope integrity conflict');
        error.code = 'INTERNAL_CONFIGURATION_ERROR';
        throw error;
      }
      if ((record.count || 0) >= limit) {
        return { allowed: false, scope, remaining: 0, retryAfterMs };
      }

      const replacement = { ...record, scope, count: (record.count || 0) + 1 };
      try {
        await container.item(key, key).replace(replacement, {
          accessCondition: { type: 'IfMatch', condition: record._etag }
        });
        return {
          allowed: true,
          scope,
          remaining: Math.max(0, limit - replacement.count),
          retryAfterMs: 0
        };
      } catch (error) {
        if (errorCode(error) !== 412) throw error;
      }
    }

    const error = new Error('rate limit contention');
    error.code = 'INFRASTRUCTURE_RETRYABLE';
    throw error;
  }

  return {
    // The core initiation flow historically passes clientSubmissionId here.
    // Ignore all caller input and bind this method permanently to initiation.
    async check() {
      return checkScope(RATE_LIMIT_SCOPES.initiate);
    },
    checkScope
  };
}

module.exports = {
  RATE_LIMIT_SCOPES,
  SCOPE_PREFIXES,
  validScope,
  createRateLimiter
};
