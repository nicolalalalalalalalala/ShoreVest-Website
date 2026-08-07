'use strict';

const { NOTIFICATION_EVENTS: EVENTS } = require('../../../../api/recruitment/core/constants');
const { policyForApplication, policyNeedsUpdate } = require('../retention/policy');

const SYSTEM_FIELDS = new Set(['_rid', '_self', '_etag', '_attachments', '_ts']);

function stripSystemFields(value) {
  const output = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (!SYSTEM_FIELDS.has(key)) output[key] = item;
  }
  return output;
}

function errorCode(error) {
  return Number(error?.code || error?.statusCode || 0);
}

function ifMatch(etag) {
  if (!etag) throw Object.assign(new Error('Missing ETag'), { code: 412 });
  return { accessCondition: { type: 'IfMatch', condition: etag } };
}

function assertBatch(response) {
  const results = Array.isArray(response?.result) ? response.result : [];
  const failed = results.find((item) => {
    const status = Number(item?.statusCode || 0);
    return status < 200 || status >= 300;
  });
  if (failed) throw Object.assign(new Error('Retention batch failed'), { code: failed.statusCode });
  const status = Number(response?.code || response?.statusCode || 200);
  if (status < 200 || status >= 300) {
    throw Object.assign(new Error('Retention batch failed'), { code: status });
  }
}

function retentionError(code, message, permanent = false) {
  return Object.assign(new Error(message), { code, permanent });
}

function redactApplication(application, timestamp) {
  return {
    ...stripSystemFields(application),
    id: 'application',
    docType: 'application',
    candidateName: '[deleted]',
    candidateEmail: null,
    candidateTelephone: null,
    candidateLocation: null,
    linkedInUrl: null,
    coverNote: null,
    requestFingerprint: null,
    technicalStatus: 'Deleted',
    candidateSubmissionStatus: 'Deleted',
    hiringStage: 'Archived',
    retentionState: 'Purged',
    retentionPurgedAtUtc: timestamp,
    retentionLeaseOwner: null,
    retentionLeaseExpiresAtUtc: null,
    retentionNextAttemptAtUtc: null,
    retentionLastErrorCode: null,
    idempotencyCleanupPending: Boolean(application.idempotencyKey),
    idempotencyCleanupLastErrorCode: null,
    legalHold: false,
    aggregateVersion: Number(application.aggregateVersion || 0) + 1,
    lastUpdatedAtUtc: timestamp,
    updatedAtUtc: timestamp
  };
}

function redactFile(file, timestamp) {
  return {
    ...stripSystemFields(file),
    id: `file:${file.fileReference}`,
    docType: 'file',
    originalFileName: '[deleted]',
    expectedHash: null,
    quarantineBlobPath: null,
    cleanBlobPath: null,
    requestFingerprint: null,
    quarantineRemovalPending: false,
    technicalStatus: 'Removed',
    retentionState: 'Purged',
    retentionPurgedAtUtc: timestamp,
    legalHold: false,
    lastUpdatedAtUtc: timestamp,
    updatedAtUtc: timestamp
  };
}

function createRetentionAdapter({ endpoint, databaseId, credential, client, now = () => new Date() } = {}) {
  const cosmosClient = client || (endpoint && credential
    ? new (require('@azure/cosmos').CosmosClient)({ endpoint, aadCredentials: credential })
    : null);
  if (!cosmosClient) throw new Error('cosmos unavailable');

  const database = cosmosClient.database(databaseId);
  const submissions = database.container('submissions');
  const idempotency = database.container('idempotency');

  async function read(container, id, partitionKey) {
    try {
      const response = await container.item(id, partitionKey).read();
      return response.resource || null;
    } catch (error) {
      if (errorCode(error) === 404) return null;
      throw error;
    }
  }

  async function filesFor(applicationReference) {
    const query = {
      query: 'SELECT * FROM c WHERE c.docType = @type ORDER BY c.createdAtUtc ASC',
      parameters: [{ name: '@type', value: 'file' }]
    };
    const { resources } = await submissions.items
      .query(query, { partitionKey: applicationReference, maxItemCount: 20 })
      .fetchAll();
    return Array.isArray(resources) ? resources : [];
  }

  async function replaceApplication(application, patch) {
    const body = {
      ...stripSystemFields(application),
      ...patch,
      id: 'application',
      docType: 'application',
      updatedAtUtc: now().toISOString()
    };
    try {
      const response = await submissions
        .item('application', application.applicationReference)
        .replace(body, ifMatch(application._etag));
      return response.resource || body;
    } catch (error) {
      if (errorCode(error) === 412) return null;
      throw error;
    }
  }

  async function applyPolicy(applicationReference, config) {
    const application = await read(submissions, 'application', applicationReference);
    if (!application || application.retentionState === 'Purged') return { status: 'ignored' };
    if (application.retentionState === 'Processing') return { status: 'in_progress' };
    const policy = policyForApplication(application, config);
    if (!policy || !policyNeedsUpdate(application, policy)) return { status: 'current' };
    const files = await filesFor(applicationReference);
    const timestamp = now().toISOString();
    const nextApplication = {
      ...stripSystemFields(application),
      ...policy,
      legalHold: application.legalHold === true,
      retentionState: application.retentionState || 'Active',
      aggregateVersion: Number(application.aggregateVersion || 0) + 1,
      lastUpdatedAtUtc: timestamp,
      updatedAtUtc: timestamp,
      id: 'application',
      docType: 'application'
    };
    const operations = [{
      operationType: 'Replace',
      id: 'application',
      ifMatch: application._etag,
      resourceBody: nextApplication
    }];
    for (const file of files) {
      operations.push({
        operationType: 'Replace',
        id: `file:${file.fileReference}`,
        ifMatch: file._etag,
        resourceBody: {
          ...stripSystemFields(file),
          ...policy,
          legalHold: application.legalHold === true || file.legalHold === true,
          retentionState: file.retentionState || 'Active',
          lastUpdatedAtUtc: timestamp,
          updatedAtUtc: timestamp,
          id: `file:${file.fileReference}`,
          docType: 'file'
        }
      });
    }
    const response = await submissions.items.batch(operations, applicationReference);
    assertBatch(response);
    return { status: 'updated', policy };
  }

  async function listPolicyCandidates({ limit, policyVersion }) {
    const query = {
      query: `SELECT TOP @limit c.applicationReference FROM c
        WHERE c.docType = 'application'
        AND (NOT IS_DEFINED(c.retentionState) OR c.retentionState != 'Purged')
        AND (
          NOT IS_DEFINED(c.retentionPolicyVersion)
          OR c.retentionPolicyVersion != @policyVersion
          OR (c.technicalStatus = 'Blocked' AND (NOT IS_DEFINED(c.retentionCategory) OR c.retentionCategory != 'Malicious'))
          OR (c.technicalStatus != 'Blocked' AND c.candidateSubmissionStatus = 'Submitted' AND (NOT IS_DEFINED(c.retentionCategory) OR c.retentionCategory != 'Submitted'))
          OR (c.technicalStatus != 'Blocked' AND c.candidateSubmissionStatus != 'Submitted' AND (NOT IS_DEFINED(c.retentionCategory) OR c.retentionCategory != 'Incomplete'))
        )`,
      parameters: [
        { name: '@limit', value: limit },
        { name: '@policyVersion', value: policyVersion }
      ]
    };
    const { resources } = await submissions.items.query(query, { maxItemCount: limit }).fetchAll();
    return (resources || []).map((item) => item.applicationReference).filter(Boolean);
  }

  async function claimDueBatch({ limit, owner, leaseExpiresAtUtc }) {
    const timestamp = now().toISOString();
    const query = {
      query: `SELECT TOP @limit * FROM c
        WHERE c.docType = 'application'
        AND (
          c.retentionState = 'Active'
          OR (
            c.retentionState = 'Processing'
            AND IS_DEFINED(c.retentionLeaseExpiresAtUtc)
            AND c.retentionLeaseExpiresAtUtc < @now
          )
        )
        AND c.legalHold != true
        AND IS_DEFINED(c.retentionDeleteAfterUtc)
        AND c.retentionDeleteAfterUtc <= @now
        AND (NOT IS_DEFINED(c.retentionNextAttemptAtUtc) OR c.retentionNextAttemptAtUtc <= @now)`,
      parameters: [
        { name: '@limit', value: limit },
        { name: '@now', value: timestamp }
      ]
    };
    const { resources } = await submissions.items.query(query, { maxItemCount: limit }).fetchAll();
    const claimed = [];
    for (const application of resources || []) {
      const updated = await replaceApplication(application, {
        retentionState: 'Processing',
        retentionLeaseOwner: owner,
        retentionLeaseExpiresAtUtc: leaseExpiresAtUtc,
        retentionAttemptCount: Number(application.retentionAttemptCount || 0) + 1,
        retentionLastAttemptAtUtc: timestamp
      });
      if (updated) claimed.push(updated);
    }
    return claimed;
  }

  async function updateControls({ applicationReference, legalHold, retentionDeleteAfterUtc, reason, principalObjectId }) {
    const application = await read(submissions, 'application', applicationReference);
    if (!application || application.retentionState === 'Purged') return null;
    const currentTime = now();
    if (application.retentionState === 'Processing') {
      const leaseExpiry = Date.parse(application.retentionLeaseExpiresAtUtc || '');
      if (!Number.isFinite(leaseExpiry) || leaseExpiry > currentTime.getTime()) {
        throw retentionError(
          'RETENTION_PURGE_IN_PROGRESS',
          'Retention controls cannot change while purge owns the application lease'
        );
      }
    }
    const files = await filesFor(applicationReference);
    const timestamp = currentTime.toISOString();
    const deadline = retentionDeleteAfterUtc || application.retentionDeleteAfterUtc || null;
    const nextApplication = {
      ...stripSystemFields(application),
      legalHold,
      retentionDeleteAfterUtc: deadline,
      retentionState: 'Active',
      retentionControlReason: reason,
      retentionControlledAtUtc: timestamp,
      retentionControlledByObjectId: principalObjectId || null,
      retentionLeaseOwner: null,
      retentionLeaseExpiresAtUtc: null,
      retentionNextAttemptAtUtc: null,
      retentionLastErrorCode: null,
      aggregateVersion: Number(application.aggregateVersion || 0) + 1,
      lastUpdatedAtUtc: timestamp,
      updatedAtUtc: timestamp,
      id: 'application',
      docType: 'application'
    };
    const operations = [{
      operationType: 'Replace',
      id: 'application',
      ifMatch: application._etag,
      resourceBody: nextApplication
    }];
    for (const file of files) {
      operations.push({
        operationType: 'Replace',
        id: `file:${file.fileReference}`,
        ifMatch: file._etag,
        resourceBody: {
          ...stripSystemFields(file),
          legalHold,
          retentionDeleteAfterUtc: deadline,
          retentionState: 'Active',
          lastUpdatedAtUtc: timestamp,
          updatedAtUtc: timestamp,
          id: `file:${file.fileReference}`,
          docType: 'file'
        }
      });
    }
    const response = await submissions.items.batch(operations, applicationReference);
    assertBatch(response);
    return nextApplication;
  }

  async function release(application, reason, retryAtUtc) {
    return replaceApplication(application, {
      retentionState: 'Active',
      retentionLeaseOwner: null,
      retentionLeaseExpiresAtUtc: null,
      retentionNextAttemptAtUtc: retryAtUtc || null,
      retentionLastErrorCode: reason || 'RETENTION_RETRYABLE'
    });
  }

  async function listIdempotencyCleanupCandidates({ limit }) {
    const query = {
      query: `SELECT TOP @limit c.applicationReference FROM c
        WHERE c.docType = 'application'
        AND c.retentionState = 'Purged'
        AND c.idempotencyCleanupPending = true
        AND IS_DEFINED(c.idempotencyKey)`,
      parameters: [{ name: '@limit', value: limit }]
    };
    const { resources } = await submissions.items.query(query, { maxItemCount: limit }).fetchAll();
    return (resources || []).map((item) => item.applicationReference).filter(Boolean);
  }

  async function cleanupIdempotency(applicationReference) {
    const application = await read(submissions, 'application', applicationReference);
    if (!application || application.retentionState !== 'Purged') return { status: 'ignored' };
    if (!application.idempotencyKey || application.idempotencyCleanupPending !== true) {
      return { status: 'current' };
    }

    try {
      await idempotency.item(application.idempotencyKey, application.idempotencyKey).delete();
    } catch (error) {
      if (errorCode(error) !== 404) {
        await replaceApplication(application, {
          idempotencyCleanupPending: true,
          idempotencyCleanupLastErrorCode: String(error.code || error.statusCode || 'IDEMPOTENCY_CLEANUP_FAILED'),
          idempotencyCleanupLastAttemptAtUtc: now().toISOString()
        });
        throw error;
      }
    }

    const fresh = await read(submissions, 'application', applicationReference);
    if (!fresh || fresh.retentionState !== 'Purged') return { status: 'conflict' };
    const cleared = await replaceApplication(fresh, {
      idempotencyKey: null,
      idempotencyCleanupPending: false,
      idempotencyCleanupLastErrorCode: null,
      idempotencyCleanupCompletedAtUtc: now().toISOString()
    });
    if (!cleared) {
      throw Object.assign(new Error('Idempotency cleanup state changed'), { code: 412 });
    }
    return { status: 'completed' };
  }

  async function purge(application, storage, containers) {
    const applicationReference = application.applicationReference;
    const freshApplication = await read(submissions, 'application', applicationReference);
    const freshFiles = await filesFor(applicationReference);
    const leaseExpiry = Date.parse(freshApplication?.retentionLeaseExpiresAtUtc || '');
    if (!freshApplication ||
      freshApplication.retentionState !== 'Processing' ||
      freshApplication.retentionLeaseOwner !== application.retentionLeaseOwner ||
      !Number.isFinite(leaseExpiry) ||
      leaseExpiry <= now().getTime()) {
      throw retentionError('RETENTION_LEASE_INVALID', 'Retention purge lease is not current');
    }
    if (freshApplication.legalHold === true || freshFiles.some((file) => file.legalHold === true)) {
      throw retentionError('LEGAL_HOLD_ACTIVE', 'Legal hold prevents retention purge', true);
    }

    for (const file of freshFiles) {
      if (file.quarantineBlobPath) {
        await storage.delete(containers.quarantine, file.quarantineBlobPath);
      }
      if (file.cleanBlobPath) {
        await storage.delete(containers.clean, file.cleanBlobPath);
      }
    }

    const timestamp = now().toISOString();
    const redactedApplication = redactApplication(freshApplication, timestamp);
    const operations = [{
      operationType: 'Replace',
      id: 'application',
      ifMatch: freshApplication._etag,
      resourceBody: redactedApplication
    }];
    for (const file of freshFiles) {
      operations.push({
        operationType: 'Replace',
        id: `file:${file.fileReference}`,
        ifMatch: file._etag,
        resourceBody: redactFile(file, timestamp)
      });
    }
    operations.push({
      operationType: 'Create',
      resourceBody: {
        id: `outbox:${EVENTS.RetentionPurged}:outbox:${applicationReference}:retention-purged`,
        docType: 'outbox',
        state: 'Pending',
        attemptCount: 0,
        type: EVENTS.RetentionPurged,
        idempotencyKey: `outbox:${applicationReference}:retention-purged`,
        applicationReference,
        createdAtUtc: timestamp,
        updatedAtUtc: timestamp
      }
    });
    const response = await submissions.items.batch(operations, applicationReference);
    assertBatch(response);

    let idempotencyCleanup = 'not-required';
    if (freshApplication.idempotencyKey) {
      try {
        const cleanup = await cleanupIdempotency(applicationReference);
        idempotencyCleanup = cleanup.status;
      } catch (_) {
        idempotencyCleanup = 'pending';
      }
    }
    return {
      success: true,
      applicationReference,
      purgedAtUtc: timestamp,
      filesPurged: freshFiles.length,
      idempotencyCleanup
    };
  }

  return {
    filesFor,
    listPolicyCandidates,
    applyPolicy,
    claimDueBatch,
    updateControls,
    release,
    listIdempotencyCleanupCandidates,
    cleanupIdempotency,
    purge
  };
}

module.exports = {
  stripSystemFields,
  assertBatch,
  redactApplication,
  redactFile,
  createRetentionAdapter
};
