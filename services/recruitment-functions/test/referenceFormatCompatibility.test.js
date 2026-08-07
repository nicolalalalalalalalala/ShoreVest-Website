'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { randomHex } = require('../src/appFactory');
const { normalizeEventGridEvent } = require('../src/lib/eventGrid');

const config = {
  uploadStorageAccountName: 'account',
  quarantineContainer: 'recruitment-quarantine'
};

test('generated recruitment references are accepted by Defender event normalization', () => {
  const applicationReference = `SV-APP-2026-${randomHex(16)}`;
  const fileReference = `SV-FILE-${randomHex(16)}`;

  assert.match(applicationReference, /^SV-APP-2026-[0-9A-F]{16}$/);
  assert.match(fileReference, /^SV-FILE-[0-9A-F]{16}$/);

  const normalized = normalizeEventGridEvent({
    id: 'scan-reference-contract',
    eventType: 'Microsoft.Security.MalwareScanningResult',
    eventTime: '2026-07-24T00:00:00.000Z',
    data: {
      blobUri: `https://account.blob.core.windows.net/recruitment-quarantine/recruitment/2026/legal-assistant/${applicationReference}/${fileReference}.pdf`,
      scanResultType: 'No threats found'
    }
  }, config);

  assert.equal(normalized.applicationReference, applicationReference);
  assert.equal(normalized.fileReference, fileReference);
});
