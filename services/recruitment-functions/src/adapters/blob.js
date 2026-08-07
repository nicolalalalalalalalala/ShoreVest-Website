'use strict';

const crypto = require('crypto');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function validBlobPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !value.includes('..');
}

function createBlobAdapter({
  accountUrl,
  credential,
  containers = {},
  clock = () => new Date(),
  serviceClient,
  sdkImpl,
  copyPollAttempts = 8,
  copyPollIntervalMs = 250,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
} = {}) {
  const sdk = sdkImpl || require('@azure/storage-blob');
  const service = serviceClient || (accountUrl && credential
    ? new sdk.BlobServiceClient(accountUrl, credential)
    : null);
  const quarantine = containers.quarantine || 'recruitment-quarantine';
  const clean = containers.clean || 'recruitment-clean';

  function container(name) {
    if (!service) throw new Error('storage unavailable');
    return service.getContainerClient(name);
  }

  function blob(containerName, path) {
    if (!validBlobPath(path)) throw new Error('invalid blob path');
    return container(containerName).getBlockBlobClient(path);
  }

  function accountName() {
    const url = new URL(accountUrl);
    return url.hostname.split('.')[0];
  }

  async function delegationSas({ container: containerName, blobPath, permissions, startsOn, expiresOn }) {
    const key = await service.getUserDelegationKey(startsOn, expiresOn);
    return sdk.generateBlobSASQueryParameters({
      containerName,
      blobName: blobPath,
      permissions: sdk.BlobSASPermissions.parse(permissions),
      startsOn,
      expiresOn,
      protocol: sdk.SASProtocol.Https
    }, key, accountName()).toString();
  }

  function validateWindow(startsOn, expiresOn, maximumMs, label) {
    const current = clock();
    if (!Number.isFinite(startsOn.getTime()) || !Number.isFinite(expiresOn.getTime())) {
      throw new Error(`invalid ${label} expiry`);
    }
    if (expiresOn <= current || startsOn >= expiresOn) throw new Error(`invalid ${label} expiry`);
    if (expiresOn - current > maximumMs + 1000) throw new Error(`${label} expiry too long`);
  }

  return {
    async issue({
      container: containerName,
      blobPath,
      permissions,
      expiresAtUtc,
      startsAtUtc,
      contentType
    }) {
      if (containerName !== quarantine) throw new Error('invalid upload container');
      if (JSON.stringify(permissions) !== JSON.stringify(['create', 'write'])) {
        throw new Error('invalid sas permissions');
      }
      const expiresOn = new Date(expiresAtUtc);
      const startsOn = new Date(startsAtUtc || clock().getTime() - 300000);
      validateWindow(startsOn, expiresOn, 10 * 60 * 1000, 'sas');
      const sas = await delegationSas({
        container: containerName,
        blobPath,
        permissions: 'cw',
        startsOn,
        expiresOn
      });
      return {
        url: `${blob(containerName, blobPath).url}?${sas}`,
        expiresAtUtc: expiresOn.toISOString(),
        method: 'PUT',
        requiredHeaders: {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': contentType
        }
      };
    },

    async issueRead({ container: containerName, blobPath, expiresAtUtc, startsAtUtc }) {
      if (containerName !== clean) throw new Error('invalid read container');
      const expiresOn = new Date(expiresAtUtc);
      const startsOn = new Date(startsAtUtc || clock().getTime() - 60000);
      validateWindow(startsOn, expiresOn, 5 * 60 * 1000, 'read sas');
      const sas = await delegationSas({
        container: containerName,
        blobPath,
        permissions: 'r',
        startsOn,
        expiresOn
      });
      return {
        url: `${blob(containerName, blobPath).url}?${sas}`,
        expiresAtUtc: expiresOn.toISOString(),
        method: 'GET'
      };
    },

    async properties(containerName, path) {
      try {
        const properties = await blob(containerName, path).getProperties();
        return {
          sizeBytes: properties.contentLength,
          contentType: properties.contentType,
          etag: properties.etag,
          sha256: properties.metadata?.sha256
        };
      } catch (error) {
        if (error.statusCode === 404) return undefined;
        throw error;
      }
    },

    async read(containerName, path, { maxBytes }) {
      const response = await blob(containerName, path).download(0, maxBytes);
      const chunks = [];
      for await (const chunk of response.readableStreamBody) chunks.push(chunk);
      return Buffer.concat(chunks).subarray(0, maxBytes);
    },

    async verify({ container: containerName, path, expectedSizeBytes, expectedContentType, expectedHash, maxBytes }) {
      const properties = await this.properties(containerName, path);
      if (!properties) return { ok: false, reason: 'missing' };
      if (properties.sizeBytes !== expectedSizeBytes || properties.contentType !== expectedContentType) {
        return { ok: false, reason: 'properties' };
      }
      const bytes = await this.read(containerName, path, {
        maxBytes: Math.min(maxBytes || expectedSizeBytes, expectedSizeBytes)
      });
      if (bytes.length !== expectedSizeBytes) return { ok: false, reason: 'bounded-read' };
      if (expectedHash && sha256(bytes) !== expectedHash) return { ok: false, reason: 'hash' };
      return { ok: true, etag: properties.etag, sha256: sha256(bytes) };
    },

    async promoteClean({
      sourceContainer = quarantine,
      sourcePath,
      destinationContainer = clean,
      destinationPath,
      expectedSizeBytes,
      expectedContentType,
      expectedHash
    }) {
      if (sourceContainer !== quarantine || destinationContainer !== clean) {
        throw new Error('invalid promotion containers');
      }
      const destination = blob(destinationContainer, destinationPath);
      const valid = async () => {
        const result = await this.verify({
          container: destinationContainer,
          path: destinationPath,
          expectedSizeBytes,
          expectedContentType,
          expectedHash,
          maxBytes: expectedSizeBytes
        }).catch(() => ({ ok: false }));
        return result.ok;
      };
      const pollCopy = async () => {
        for (let attempt = 0; attempt < copyPollAttempts; attempt += 1) {
          const properties = await destination.getProperties();
          if (properties.copyStatus === 'success') {
            return await valid()
              ? { status: 'Succeeded' }
              : { status: 'Failed', reason: 'verification' };
          }
          if (['failed', 'aborted'].includes(properties.copyStatus)) {
            return { status: 'Failed', reason: properties.copyStatus };
          }
          if (properties.copyStatus && properties.copyStatus !== 'pending') {
            return { status: 'Failed', reason: `unexpected-copy-status:${properties.copyStatus}` };
          }
          if (attempt + 1 < copyPollAttempts) await delay(copyPollIntervalMs);
        }
        return { status: 'Pending' };
      };

      if (await valid()) return { status: 'Succeeded' };
      try {
        const existing = await destination.getProperties();
        if (existing.copyStatus === 'pending') return pollCopy();
        if (existing.copyStatus === 'success') {
          return await valid()
            ? { status: 'Succeeded' }
            : { status: 'Failed', reason: 'verification' };
        }
        if (['failed', 'aborted'].includes(existing.copyStatus)) {
          return { status: 'Failed', reason: existing.copyStatus };
        }
        return { status: 'Failed', reason: 'conflicting destination' };
      } catch (error) {
        if (error.statusCode !== 404) throw error;
      }

      const source = blob(sourceContainer, sourcePath);
      const startsOn = new Date(clock().getTime() - 60000);
      const expiresOn = new Date(clock().getTime() + 5 * 60 * 1000);
      const sourceSas = await delegationSas({
        container: sourceContainer,
        blobPath: sourcePath,
        permissions: 'r',
        startsOn,
        expiresOn
      });
      await destination.beginCopyFromURL(`${source.url}?${sourceSas}`);
      return pollCopy();
    },

    async delete(containerName, path) {
      try {
        await blob(containerName, path).deleteIfExists();
        return true;
      } catch (error) {
        if (error.statusCode === 404) return false;
        throw error;
      }
    },

    async health() {
      await Promise.all([
        container(quarantine).getProperties(),
        container(clean).getProperties()
      ]);
      return { ok: true };
    }
  };
}

module.exports = {
  sha256,
  validBlobPath,
  createBlobAdapter
};
