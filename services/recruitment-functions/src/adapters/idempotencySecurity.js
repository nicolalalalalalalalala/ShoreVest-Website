'use strict';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sanitizeIdempotencyRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const sanitized = clone(record);
  delete sanitized.result;
  delete sanitized.upload;
  delete sanitized.completionToken;
  if (sanitized.record && typeof sanitized.record === 'object') {
    delete sanitized.record.result;
    delete sanitized.record.upload;
    delete sanitized.record.completionToken;
  }
  return sanitized;
}

function activeCredentialGeneration(record, nowMs = Date.now()) {
  if (!record || typeof record !== 'object') return null;
  if (record.state === 'Completed' || record.state === 'PermanentFailure') return null;
  const stable = record.stableResult;
  const generation = Number(stable?.credentialGeneration);
  const expiresAtMs = Date.parse(stable?.lastCredentialExpiryUtc || '');
  if (!Number.isInteger(generation) || generation < 1) return null;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return null;
  return generation;
}

function secureIdempotencyAdapter(idempotency) {
  if (!idempotency || typeof idempotency.credentialsIssued !== 'function') {
    throw new Error('idempotency adapter unavailable');
  }

  return {
    ...idempotency,
    async claim(...args) {
      return sanitizeIdempotencyRecord(await idempotency.claim(...args));
    },
    async get(...args) {
      return sanitizeIdempotencyRecord(await idempotency.get(...args));
    },
    async beginCredentialIssuance(key, ...args) {
      const current = await idempotency.get(key);
      const activeGeneration = activeCredentialGeneration(current);
      const lease = await idempotency.beginCredentialIssuance(key, ...args);
      const sanitized = sanitizeIdempotencyRecord(lease);
      if (sanitized?.status === 'claimed' && activeGeneration !== null) {
        return {
          ...sanitized,
          generation: activeGeneration,
          reissuedActiveCredentials: true
        };
      }
      return sanitized;
    },
    async credentialsIssued(key, _credentialResult, stableResult) {
      return idempotency.credentialsIssued(key, null, stableResult);
    }
  };
}

module.exports = {
  activeCredentialGeneration,
  sanitizeIdempotencyRecord,
  secureIdempotencyAdapter
};
