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
      checks.push({ name: 'cosmos', run: () => dependencies.health() });
    }
    if (typeof dependencies?.storage?.health === 'function') {
      checks.push({ name: 'storage', run: () => dependencies.storage.health() });
    }
    if (config.apiEnabled === true && typeof dependencies?.secretProvider?.health === 'function') {
      const secretNames = [
        config.completionTokenSecretName,
        config.fingerprintSecretName,
        config.botVerification?.secretName
      ].filter(Boolean);
      checks.push({ name: 'secrets', run: () => dependencies.secretProvider.health(secretNames) });
    }
    if (config.outboxDelivery?.enabled === true && typeof dependencies?.graph?.health === 'function') {
      checks.push({
        name: 'graph',
        run: () => dependencies.graph.health({
          siteId: config.sharePoint.siteId,
          applicationsListId: config.sharePoint.applicationsListId,
          filesListId: config.sharePoint.filesListId,
          mailbox: config.candidateAcknowledgement.mailbox
        })
      });
    }

    const componentResults = {};
    let ready = checks.length > 0;
    await Promise.all(checks.map(async (check) => {
      try {
        const value = await check.run();
        const ok = value?.ok === true;
        componentResults[check.name] = ok ? 'ready' : 'unavailable';
        if (!ok) ready = false;
      } catch (_) {
        componentResults[check.name] = 'unavailable';
        ready = false;
      }
    }));

    const result = {
      ok: ready,
      runtime: 'active',
      configuration: 'valid',
      dependencies: ready ? 'ready' : 'unavailable'
    };
    if (config.environment !== 'production' && config.environment !== 'prod') {
      result.components = componentResults;
    }
    cached = { expiresAt: timestamp + ttlMs, result };
    return result;
  }

  probe.clear = () => {
    cached = null;
  };

  return probe;
}

module.exports = { createReadinessProbe };
