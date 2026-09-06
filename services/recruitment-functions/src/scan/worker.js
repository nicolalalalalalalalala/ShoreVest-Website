'use strict';

// Long-running scan worker for the ClamAV Container App.
//
// Event Grid delivers `Microsoft.Storage.BlobCreated` events for the quarantine
// container to an Azure Storage Queue; this worker drains that queue, scans each
// CV against the co-located clamd daemon (localhost), and drives the recruitment
// core pipeline. It scales to zero when the queue is empty (KEDA), so it fits the
// Azure Container Apps free monthly grant.
//
// The worker reuses the same adapters/config as the Functions app (createDeps),
// so Cosmos, Blob and notification behaviour are identical to the rest of the
// pipeline — only the scan source differs.

const { QueueClient } = require('@azure/storage-queue');
const { DefaultAzureCredential, ManagedIdentityCredential } = require('@azure/identity');
const { loadConfig } = require('../lib/config');
const { createDeps } = require('../appFactory');
const { createClamAvScanner } = require('../lib/clamav');
const { normalizeStorageBlobCreatedEvent } = require('../lib/eventGrid');
const { scanQuarantineBlob, RetryableScanError } = require('./scanRunner');

function decodeQueueMessage(text) {
  // Event Grid writes queue messages as base64-encoded JSON by default; fall back
  // to raw JSON if base64 decoding does not yield valid JSON.
  let body = text;
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8');
    JSON.parse(decoded);
    body = decoded;
  } catch (_) { /* not base64 */ }
  const parsed = JSON.parse(body);
  return Array.isArray(parsed) ? parsed : [parsed];
}

// Decides what to do with one queue message. Returns 'delete' (done or not ours),
// 'leave' (transient — let the visibility timeout redeliver), or 'poison'
// (retried too many times — remove so it stops blocking the queue).
async function handleQueueMessage(message, deps, scanner, options = {}) {
  const maxDequeue = options.maxDequeue || 5;
  let events;
  try {
    events = decodeQueueMessage(message.messageText);
  } catch (_) {
    return { action: 'delete', reason: 'unparseable' };
  }

  let sawRetryable = null;
  for (const event of events) {
    let blobInput;
    try {
      blobInput = normalizeStorageBlobCreatedEvent(event, deps.config);
    } catch (_) {
      // Not a quarantine-CV BlobCreated event (other container, other path,
      // subscription-validation, delete event) — acknowledge and drop.
      continue;
    }
    try {
      await scanQuarantineBlob(blobInput, deps, scanner, options);
    } catch (error) {
      if (error instanceof RetryableScanError) { sawRetryable = error; continue; }
      throw error;
    }
  }

  if (sawRetryable) {
    if ((message.dequeueCount || 1) >= maxDequeue) {
      await options.logRetryExhausted?.(sawRetryable, message);
      return { action: 'poison', reason: sawRetryable.reason };
    }
    return { action: 'leave', reason: sawRetryable.reason };
  }
  return { action: 'delete', reason: 'processed' };
}

function createCredential(cfg) {
  return cfg.managedIdentityClientId
    ? new ManagedIdentityCredential(cfg.managedIdentityClientId)
    : new DefaultAzureCredential();
}

async function runWorker({ config = loadConfig(), signal } = {}) {
  if (!config.scanQueueUrl) throw new Error('RECRUITMENT_SCAN_QUEUE_URL is required');
  if (!config.clamavHost) throw new Error('CLAMAV_HOST is required');

  const credential = createCredential(config);
  const queue = new QueueClient(config.scanQueueUrl, credential);
  const scanner = createClamAvScanner({ host: config.clamavHost, port: config.clamavPort, timeoutMs: config.clamavTimeoutMs });
  const context = { log: (...a) => console.log(...a), warn: (...a) => console.warn(...a), error: (...a) => console.error(...a) };
  const deps = { ...createDeps(config, context), config };
  const options = {
    maxScanBytes: config.maxScanBytes,
    maxDequeue: config.scanMaxDequeue,
    logRetryExhausted: async (err, msg) => context.warn('clamav_scan_retry_exhausted', { reason: err.reason, dequeueCount: msg.dequeueCount })
  };

  const idleDelayMs = config.scanIdleDelayMs || 5000;
  while (!signal?.aborted) {
    let received;
    try {
      received = await queue.receiveMessages({ numberOfMessages: 16, visibilityTimeout: config.scanVisibilityTimeoutSeconds || 300 });
    } catch (error) {
      context.error('clamav_queue_receive_failed', { code: error.code || 'RECEIVE_FAILED' });
      await sleep(idleDelayMs, signal);
      continue;
    }
    const messages = received.receivedMessageItems || [];
    if (messages.length === 0) { await sleep(idleDelayMs, signal); continue; }

    for (const message of messages) {
      try {
        const outcome = await handleQueueMessage(message, deps, scanner, options);
        if (outcome.action === 'delete' || outcome.action === 'poison') {
          await queue.deleteMessage(message.messageId, message.popReceipt);
        }
        // 'leave' → do nothing; the visibility timeout redelivers the message.
      } catch (error) {
        context.error('clamav_message_failed', { code: error.code || 'MESSAGE_FAILED' });
        // Leave the message for redelivery on unexpected failure.
      }
    }
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener?.('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

module.exports = { runWorker, handleQueueMessage, decodeQueueMessage };

if (require.main === module) {
  runWorker().catch((error) => { console.error('clamav_worker_fatal', error); process.exit(1); });
}
