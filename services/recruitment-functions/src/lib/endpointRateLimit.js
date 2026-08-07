'use strict';

const { withCors } = require('./http');
const { RATE_LIMIT_SCOPES } = require('../adapters/rateLimit');

const MAX_RETRY_AFTER_SECONDS = 86400;

function retryAfterSeconds(retryAfterMs) {
  const milliseconds = Number(retryAfterMs || 0);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 1;
  return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, Math.ceil(milliseconds / 1000)));
}

function rateLimitedResponse(req, config, decision = {}) {
  const seconds = retryAfterSeconds(decision.retryAfterMs);
  return {
    status: 429,
    headers: withCors(req, config, { 'Retry-After': String(seconds) }),
    jsonBody: {
      success: false,
      errorCode: 'RATE_LIMITED',
      retryAfterMs: seconds * 1000
    }
  };
}

async function applyEndpointRateLimit({
  req,
  config,
  dependencies,
  scope,
  reuseForCoreInitiation = false
}) {
  if (!Object.values(RATE_LIMIT_SCOPES).includes(scope)) {
    const error = new Error('endpoint rate limit scope is invalid');
    error.code = 'INTERNAL_CONFIGURATION_ERROR';
    throw error;
  }
  if (!dependencies?.rateLimiter || typeof dependencies.rateLimiter.checkScope !== 'function') {
    const error = new Error('endpoint rate limiter is unavailable');
    error.code = 'INTERNAL_CONFIGURATION_ERROR';
    throw error;
  }

  const decision = await dependencies.rateLimiter.checkScope(scope);
  if (decision?.allowed !== true) {
    return { allowed: false, response: rateLimitedResponse(req, config, decision) };
  }

  if (reuseForCoreInitiation === true) {
    dependencies.rateLimiter.check = async () => decision;
  }
  return { allowed: true, decision };
}

module.exports = {
  MAX_RETRY_AFTER_SECONDS,
  retryAfterSeconds,
  rateLimitedResponse,
  applyEndpointRateLimit
};
