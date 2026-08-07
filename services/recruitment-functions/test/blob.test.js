'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { sha256, createBlobAdapter } = require('../src/adapters/blob');

function readable(bytes) {
  return (async function* stream() {
    yield bytes;
  }());
}

function storageFixture() {
  const bytes = Buffer.from('%PDF-private-clean-copy');
  let copied = false;
  let copySourceUrl = null;
  const delegationRequests = [];
  const containerPropertyReads = [];

  const sourceBlob = {
    url: 'https://account.blob.core.windows.net/recruitment-quarantine/source.pdf'
  };
  const destinationBlob = {
    url: 'https://account.blob.core.windows.net/recruitment-clean/source.pdf',
    async getProperties() {
      if (!copied) throw Object.assign(new Error('not found'), { statusCode: 404 });
      return {
        copyStatus: 'success',
        contentLength: bytes.length,
        contentType: 'application/pdf',
        etag: 'clean-etag'
      };
    },
    async beginCopyFromURL(url) {
      copySourceUrl = url;
      copied = true;
    },
    async download() {
      return { readableStreamBody: readable(bytes) };
    }
  };

  const serviceClient = {
    async getUserDelegationKey(startsOn, expiresOn) {
      delegationRequests.push({ startsOn, expiresOn });
      return { signedObjectId: 'test' };
    },
    getContainerClient(container) {
      return {
        async getProperties() {
          containerPropertyReads.push(container);
          return { etag: `${container}-etag` };
        },
        getBlockBlobClient() {
          return container === 'recruitment-quarantine' ? sourceBlob : destinationBlob;
        }
      };
    }
  };
  const sdkImpl = {
    BlobSASPermissions: { parse: (value) => value },
    SASProtocol: { Https: 'https' },
    generateBlobSASQueryParameters(input) {
      return { toString: () => `sp=${input.permissions}&sig=test` };
    }
  };

  return {
    bytes,
    serviceClient,
    sdkImpl,
    delegationRequests,
    containerPropertyReads,
    get copySourceUrl() { return copySourceUrl; }
  };
}

function pendingCopyFixture() {
  const bytes = Buffer.from('%PDF-pending-private-copy');
  let state = 'missing';
  let copyStarts = 0;
  const delegationRequests = [];

  const sourceBlob = {
    url: 'https://account.blob.core.windows.net/recruitment-quarantine/pending.pdf'
  };
  const destinationBlob = {
    url: 'https://account.blob.core.windows.net/recruitment-clean/pending.pdf',
    async getProperties() {
      if (state === 'missing') throw Object.assign(new Error('not found'), { statusCode: 404 });
      return {
        copyStatus: state,
        contentLength: state === 'success' ? bytes.length : 0,
        contentType: 'application/pdf',
        etag: `etag-${state}`
      };
    },
    async beginCopyFromURL() {
      copyStarts += 1;
      state = 'pending';
    },
    async download() {
      return { readableStreamBody: readable(bytes) };
    }
  };

  const serviceClient = {
    async getUserDelegationKey(startsOn, expiresOn) {
      delegationRequests.push({ startsOn, expiresOn });
      return { signedObjectId: 'test' };
    },
    getContainerClient(container) {
      return {
        async getProperties() {
          return { etag: `${container}-etag` };
        },
        getBlockBlobClient() {
          return container === 'recruitment-quarantine' ? sourceBlob : destinationBlob;
        }
      };
    }
  };
  const sdkImpl = {
    BlobSASPermissions: { parse: (value) => value },
    SASProtocol: { Https: 'https' },
    generateBlobSASQueryParameters(input) {
      return { toString: () => `sp=${input.permissions}&sig=test` };
    }
  };

  return {
    bytes,
    serviceClient,
    sdkImpl,
    delegationRequests,
    get copyStarts() { return copyStarts; },
    completeCopy() { state = 'success'; }
  };
}

function adapter(fixture, options = {}) {
  return createBlobAdapter({
    accountUrl: 'https://account.blob.core.windows.net',
    containers: {
      quarantine: 'recruitment-quarantine',
      clean: 'recruitment-clean'
    },
    clock: () => new Date('2026-07-22T00:00:00.000Z'),
    serviceClient: fixture.serviceClient,
    sdkImpl: fixture.sdkImpl,
    ...options
  });
}

function promotionInput(fixture, name = 'source.pdf') {
  return {
    sourcePath: name,
    destinationPath: name,
    expectedSizeBytes: fixture.bytes.length,
    expectedContentType: 'application/pdf',
    expectedHash: sha256(fixture.bytes)
  };
}

test('clean promotion authorizes the private quarantine source with an internal read SAS', async () => {
  const fixture = storageFixture();
  const storage = adapter(fixture);

  const result = await storage.promoteClean(promotionInput(fixture));

  assert.deepEqual(result, { status: 'Succeeded' });
  assert.ok(fixture.copySourceUrl.startsWith(
    'https://account.blob.core.windows.net/recruitment-quarantine/source.pdf?'
  ));
  assert.ok(fixture.copySourceUrl.includes('sp=r'));
  assert.equal(fixture.delegationRequests.length, 1);
  assert.equal(
    fixture.delegationRequests[0].expiresOn - fixture.delegationRequests[0].startsOn,
    6 * 60 * 1000
  );
});

test('pending clean copy resumes on retry without starting a duplicate copy', async () => {
  const fixture = pendingCopyFixture();
  const storage = adapter(fixture, {
    copyPollAttempts: 1,
    copyPollIntervalMs: 0,
    delay: async () => {}
  });

  assert.deepEqual(await storage.promoteClean(promotionInput(fixture, 'pending.pdf')), {
    status: 'Pending'
  });
  assert.equal(fixture.copyStarts, 1);
  assert.equal(fixture.delegationRequests.length, 1);

  fixture.completeCopy();
  assert.deepEqual(await storage.promoteClean(promotionInput(fixture, 'pending.pdf')), {
    status: 'Succeeded'
  });
  assert.equal(fixture.copyStarts, 1);
  assert.equal(fixture.delegationRequests.length, 1);
});

test('read SAS rejects excessive or inverted validity windows', async () => {
  const fixture = storageFixture();
  const storage = adapter(fixture);

  await assert.rejects(() => storage.issueRead({
    container: 'recruitment-clean',
    blobPath: 'source.pdf',
    startsAtUtc: '2026-07-22T00:00:00.000Z',
    expiresAtUtc: '2026-07-22T00:06:00.000Z'
  }), /expiry too long/);

  await assert.rejects(() => storage.issueRead({
    container: 'recruitment-clean',
    blobPath: 'source.pdf',
    startsAtUtc: '2026-07-22T00:02:00.000Z',
    expiresAtUtc: '2026-07-22T00:01:00.000Z'
  }), /invalid read sas expiry/);
});

test('storage readiness reads only the two private container properties', async () => {
  const fixture = storageFixture();
  const storage = adapter(fixture);

  assert.deepEqual(await storage.health(), { ok: true });
  assert.deepEqual(fixture.containerPropertyReads.sort(), [
    'recruitment-clean',
    'recruitment-quarantine'
  ]);
  assert.equal(typeof fixture.serviceClient.getProperties, 'undefined');
});
