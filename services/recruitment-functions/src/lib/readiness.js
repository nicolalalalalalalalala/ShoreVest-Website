'use strict';

const { validateConfig } = require('./config');

function createReadinessProbe({ ttlMs = 30000, now = () => Date.now() } = {}) {
  let cached = null;

  async function probe(config, dependencies) {
    const timestamp = now();
    if (cached && cached.expiresAt > timestamp) return cached.result;

    const shape = validateConfig(config);
    if (!shape.ok) {
      const result = {
        ok: false,
        runtime: 'active',
        configuration: 'invalid',
        dependencies: 'not-checked'
      };
      cached = { expiresAt: timestamp + ttlMs, result };
      return result;
    }

    const checks = [];
    if (typeof dependencies?.health === 'function') {
      checks.push(() => dependencies.health());
    }
    if (typeof dependencies?.storage?.health === 'function') {
      checks.push(() => dependencies.storage.health());
    }
    if (config.apiEnabled === true && typeof dependencies?.secretProvider?.health === 'function') {
      const secretNames = [
        config.completionTokenSecretName,
        config.fingerprintSecretName,
        config.botVerification?.secretName
      ].filter(Boolean);
      checks.push(() => dependencies.secretProvider.health(secretNames));
    }
    if (config.outboxDelivery?.enabled === true && typeof dependencies?.graph?.health === 'function') {
      checks.push(() => dependencies.graph.health({
        siteId: config.sharePoint.siteId,
        applicationsListId: config.sharePoint.applicationsListId,
        filesListId: config.sharePoint.filesListId,
        mailbox: config.candidateAcknowledgement.mailbox
      }));
    }

    let ready = checks.length > 0;
    try {
      const results = await Promise.all(checks.map((check) => check()));
      ready = ready && results.every((result) => result?.ok === true);
    } catch (_) {
      ready = false;
    }

    const result = {
      ok: ready,
      runtime: 'active',
      configuration: 'valid',
      dependencies: ready ? 'ready' : 'unavailable'
    };
    cached = { expiresAt: timestamp + ttlMs, result };
    return result;
  }

  probe.clear = () => {
    cached = null;
  };

  return probe;
}

module.exports = { createReadinessProbe };
