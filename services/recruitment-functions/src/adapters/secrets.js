'use strict';

const crypto = require('crypto');

const FINALIZATION_AUDIENCE = 'shorevest.recruitment.application-finalization';

function equal(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validatePayloadForSigning(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw Object.assign(new Error('token payload invalid'), { code: 'TOKEN_PAYLOAD_INVALID' });
  }
  if (payload.audience === FINALIZATION_AUDIENCE && !payload.uploadVerifiedAtUtc) {
    throw Object.assign(new Error('upload verification not yet visible'), {
      code: 'SUBMISSION_IN_PROGRESS'
    });
  }
}

function createSecretProvider({ vaultUrl, credential, ttlMs = 300000, client } = {}) {
  const secretClient = client || (vaultUrl && credential
    ? new (require('@azure/keyvault-secrets').SecretClient)(vaultUrl, credential)
    : null);
  const cache = new Map();

  async function get(name) {
    const cached = cache.get(name);
    if (cached && cached.expires > Date.now()) return cached.value;
    if (!secretClient) {
      throw Object.assign(new Error('key vault unavailable'), {
        code: 'INTERNAL_CONFIGURATION_ERROR'
      });
    }
    const result = await secretClient.getSecret(name);
    if (!result.value) {
      throw Object.assign(new Error('secret missing'), {
        code: 'INTERNAL_CONFIGURATION_ERROR'
      });
    }
    cache.set(name, { value: result.value, expires: Date.now() + ttlMs });
    return result.value;
  }

  return {
    get,
    async health(names = []) {
      if (!Array.isArray(names) || names.length === 0) return { ok: false };
      await Promise.all([...new Set(names)].map((name) => get(name)));
      return { ok: true };
    }
  };
}

function createTokenAdapter(provider, name) {
  return {
    async sign(payload) {
      validatePayloadForSigning(payload);
      const secret = await provider.get(name);
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
      return `${encoded}.${signature}`;
    },

    async verify(token) {
      const [encoded, signature, extra] = String(token || '').split('.');
      if (!encoded || !signature || extra !== undefined) throw new Error('invalid token');
      const secret = await provider.get(name);
      const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
      if (!equal(signature, expected)) throw new Error('invalid token');
      return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    }
  };
}

function createFingerprintAdapter(provider, name) {
  return {
    async hmac(canonical) {
      const secret = await provider.get(name);
      return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
    }
  };
}

module.exports = {
  FINALIZATION_AUDIENCE,
  equal,
  validatePayloadForSigning,
  createSecretProvider,
  createTokenAdapter,
  createFingerprintAdapter
};
