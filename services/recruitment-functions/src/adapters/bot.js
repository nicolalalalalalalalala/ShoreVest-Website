'use strict';

function normalizeHostnames(values, fallback) {
  const source = Array.isArray(values)
    ? values
    : String(fallback || '').split(',');
  return [...new Set(source
    .map((value) => String(value || '').trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean))];
}

function createBotVerifier({
  mode = 'disabled',
  environment = 'production',
  secretProvider,
  secretName,
  endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  expectedHostnames,
  expectedHostname = '',
  expectedAction = '',
  fetchImpl = globalThis.fetch
} = {}) {
  const allowedHostnames = normalizeHostnames(expectedHostnames, expectedHostname);
  const requiredAction = String(expectedAction || '').trim();

  return {
    async verify(request) {
      if (mode === 'disabled') return { ok: environment !== 'production' && environment !== 'prod' };
      if (
        mode !== 'turnstile' ||
        !secretProvider ||
        !secretName ||
        typeof fetchImpl !== 'function' ||
        allowedHostnames.length === 0 ||
        !requiredAction
      ) {
        return { ok: false };
      }

      const token = request?.botToken;
      if (typeof token !== 'string' || token.length < 10 || token.length > 4096) return { ok: false };

      try {
        const secret = await secretProvider.get(secretName);
        const form = new URLSearchParams({ secret, response: token });
        const remoteIp = request?._requestContext?.clientIp;
        if (remoteIp) form.set('remoteip', remoteIp);

        const options = {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: form
        };
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          options.signal = AbortSignal.timeout(5000);
        }

        const response = await fetchImpl(endpoint, options);
        if (!response || response.ok !== true) return { ok: false };
        const result = await response.json();
        if (result?.success !== true) return { ok: false };
        const hostname = String(result.hostname || '').toLowerCase().replace(/\.$/, '');
        if (!allowedHostnames.includes(hostname)) return { ok: false };
        if (result.action !== requiredAction) return { ok: false };
        return { ok: true };
      } catch (_) {
        return { ok: false };
      }
    }
  };
}

module.exports = { normalizeHostnames, createBotVerifier };
