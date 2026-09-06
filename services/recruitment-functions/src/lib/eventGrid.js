'use strict';

const { SCAN_RESULTS } = require('../../../../api/recruitment/core/constants');

const TYPE = 'Microsoft.Security.MalwareScanningResult';
const APP_PATTERN = 'SV-APP-[0-9]{4}-[0-9A-F]{16}';
const FILE_PATTERN = 'SV-FILE-[0-9A-F]{16}';
const PATH_RE = new RegExp(`^recruitment/(\\d{4})/([^/]+)/(${APP_PATTERN})/(${FILE_PATTERN})\\.([A-Za-z0-9]+)$`);

function parseBlob(uri) {
  const parsed = new URL(uri);
  const [container, ...rest] = parsed.pathname.slice(1).split('/');
  return { account: parsed.hostname.split('.')[0], container, path: rest.join('/') };
}

function normalizeResult(rawValue) {
  const resultMap = {
    'No threats found': SCAN_RESULTS.Clean,
    Malicious: SCAN_RESULTS.Malicious,
    'Not Scanned': SCAN_RESULTS.Unsupported,
    Error: SCAN_RESULTS.ScanFailed,
    Failed: SCAN_RESULTS.ScanFailed,
    Timeout: SCAN_RESULTS.Timeout,
    'Scan timed out': SCAN_RESULTS.Timeout
  };
  return resultMap[rawValue];
}

const BLOB_CREATED_TYPE = 'Microsoft.Storage.BlobCreated';

// Normalizes a Storage `Microsoft.Storage.BlobCreated` event (Event Grid schema
// or CloudEvents schema) into the fields the ClamAV scan worker needs. This is
// the trigger for the free self-hosted scan path: a CV landing in quarantine is
// what starts a scan (Defender is not used — see MALWARE_SCANNING_CLAMAV.md).
function normalizeStorageBlobCreatedEvent(event, config) {
  if (!event || typeof event !== 'object') throw new Error('malformed event');
  const eventType = event.eventType || event.type;
  if (eventType !== BLOB_CREATED_TYPE) throw new Error('wrong event type');

  const data = event.data || {};
  const blobUri = data.url || data.blobUrl || data.blobUri;
  const eventId = event.id;
  const eventTime = event.eventTime || event.time;
  if (!eventId || !blobUri) throw new Error('malformed event');

  const blob = parseBlob(blobUri);
  if (config.uploadStorageAccountName && blob.account !== config.uploadStorageAccountName) throw new Error('wrong storage account');
  if (blob.container !== config.quarantineContainer) throw new Error('wrong container');

  const match = blob.path.match(PATH_RE);
  if (!match) throw new Error('malformed blob path');

  return {
    eventId,
    eventTime: eventTime && !Number.isNaN(Date.parse(eventTime)) ? eventTime : null,
    account: blob.account,
    container: blob.container,
    blobPath: blob.path,
    roleId: match[2],
    applicationReference: match[3],
    fileReference: match[4],
    extension: match[5],
    api: data.api || null,
    contentLength: typeof data.contentLength === 'number' ? data.contentLength : null
  };
}

function normalizeEventGridEvent(event, config) {
  if (!event || event.eventType !== TYPE) throw new Error('wrong event type');
  if (event.dataVersion && event.dataVersion !== '1.0') throw new Error('unsupported data version');
  if (event.metadataVersion && String(event.metadataVersion) !== '1') throw new Error('unsupported metadata version');

  const data = event.data || {};
  const blobUri = data.blobUri || data.blobUrl || data.blobURL;
  if (!event.id || !blobUri) throw new Error('malformed event');

  const blob = parseBlob(blobUri);
  if (config.uploadStorageAccountName && blob.account !== config.uploadStorageAccountName) throw new Error('wrong storage account');
  if (blob.container !== config.quarantineContainer) throw new Error('wrong container');

  const match = blob.path.match(PATH_RE);
  if (!match) throw new Error('malformed blob path');

  const rawResult = data.scanResultType || data.scanResult || data.resultType || data.scanResultDetails?.scanResultType;
  const result = normalizeResult(rawResult);
  if (!result) throw new Error('unknown scan result');

  const scannedAtUtc = data.scanFinishedTimeUtc || data.scanCompletionTimeUtc || event.eventTime;
  if (!scannedAtUtc || Number.isNaN(Date.parse(scannedAtUtc))) throw new Error('malformed scan time');

  return {
    eventId: event.id,
    correlationId: data.correlationId || event.correlationId || null,
    roleId: match[2],
    applicationReference: match[3],
    fileReference: match[4],
    blobPath: blob.path,
    blobETag: data.blobETag || data.eTag || data.blobEtag,
    sha256: data.sha256 || data.scanResultDetails?.sha256 || null,
    result,
    scannedAtUtc
  };
}

module.exports = { normalizeEventGridEvent, normalizeStorageBlobCreatedEvent, TYPE, BLOB_CREATED_TYPE, PATH_RE };
