'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { normalizeHostnames, createBotVerifier } = require('../src/adapters/bot');

function verifier(result, patch = {}) {
  return createBotVerifier({
    mode: 'turnstile',
    environment: 'production',
    secretProvider: { async get() { return 'secret'; } },
    secretName: 'turnstile',
    expectedHostnames: ['shorevest.com', 'www.shorevest.com'],
    expectedAction: 'recruitment-application',
    fetchImpl: async (_, options) => ({
      ok: true,
      options,
      async json() { return result; }
    }),
    ...patch
  });
}

test('disabled bot verification fails closed in production', async () => {
  const botVerifier = createBotVerifier({ mode: 'disabled', environment: 'production' });
  assert.deepEqual(await botVerifier.verify({}), { ok: false });
});

test('hostname normalization is bounded to explicit unique values', () => {
  assert.deepEqual(normalizeHostnames([
    'ShoreVest.com',
    'www.shorevest.com.',
    'shorevest.com',
    ''
  ]), ['shorevest.com', 'www.shorevest.com']);
});

test('Turnstile verification validates success, action and apex hostname', async () => {
  let postedBody = '';
  const botVerifier = createBotVerifier({
    mode: 'turnstile',
    environment: 'production',
    secretProvider: { async get() { return 'secret'; } },
    secretName: 'turnstile',
    expectedHostnames: ['shorevest.com', 'www.shorevest.com'],
    expectedAction: 'recruitment-application',
    fetchImpl: async (_, options) => {
      postedBody = options.body.toString();
      return {
        ok: true,
        async json() {
          return {
            success: true,
            hostname: 'shorevest.com',
            action: 'recruitment-application'
          };
        }
      };
    }
  });

  const result = await botVerifier.verify({
    botToken: 'valid-turnstile-token',
    _requestContext: { clientIp: '203.0.113.10' }
  });
  assert.deepEqual(result, { ok: true });
  assert.match(postedBody, /secret=secret/);
  assert.match(postedBody, /remoteip=203.0.113.10/);
});

test('Turnstile verification accepts the explicitly configured www hostname', async () => {
  assert.deepEqual(await verifier({
    success: true,
    hostname: 'www.shorevest.com',
    action: 'recruitment-application'
  }).verify({ botToken: 'valid-turnstile-token' }), { ok: true });
});

test('Turnstile verification rejects hostname mismatch and lookalikes', async () => {
  for (const hostname of [
    'attacker.example',
    'shorevest.com.attacker.example',
    'www.shorevest.com.attacker.example'
  ]) {
    assert.deepEqual(await verifier({
      success: true,
      hostname,
      action: 'recruitment-application'
    }).verify({ botToken: 'valid-turnstile-token' }), { ok: false });
  }
});

test('Turnstile verification rejects tokens issued for another action', async () => {
  assert.deepEqual(await verifier({
    success: true,
    hostname: 'shorevest.com',
    action: 'newsletter-subscribe'
  }).verify({ botToken: 'valid-turnstile-token' }), { ok: false });
});

test('Turnstile verification fails closed without hostname or action constraints', async () => {
  const result = {
    success: true,
    hostname: 'shorevest.com',
    action: 'recruitment-application'
  };
  assert.deepEqual(await verifier(result, {
    expectedHostnames: [],
    expectedAction: 'recruitment-application'
  }).verify({ botToken: 'valid-turnstile-token' }), { ok: false });
  assert.deepEqual(await verifier(result, {
    expectedHostnames: ['shorevest.com'],
    expectedAction: ''
  }).verify({ botToken: 'valid-turnstile-token' }), { ok: false });
});
