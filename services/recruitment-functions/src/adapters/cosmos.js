'use strict';

const SYSTEM_FIELDS = new Set(['_rid', '_self', '_etag', '_attachments', '_ts']);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

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

function mapCosmosError(error) {
  const code = errorCode(error);
  if (code === 429) return { code: 'INFRASTRUCTURE_RETRYABLE', retryAfterMs: error.retryAfterInMs };
  if (code === 409) return { code: 'IDEMPOTENCY_CONFLICT' };
  if (code === 412) return { code: 'INFRASTRUCTURE_RETRYABLE' };
  if (code >= 500) return { code: 'INFRASTRUCTURE_RETRYABLE' };
  return { code: 'SUBMISSION_FAILED' };
}

function throwCosmos(code, message) {
  throw Object.assign(new Error(message), { code });
}

function operationResults(response) {
  if (Array.isArray(response?.result)) return response.result;
  if (Array.isArray(response)) return response;
  return [];
}

function assertBatchSuccess(response) {
  const failed = operationResults(response).find((item) => {
    const status = Number(item?.statusCode || 0);
    return status < 200 || status >= 300;
  });
  if (failed) throwCosmos(failed.statusCode, 'Cosmos transactional batch failed');
  const code = Number(response?.code || response?.statusCode || 200);
  if (code < 200 || code >= 300) throwCosmos(code, 'Cosmos transactional batch failed');
}

function ifMatch(etag) {
  if (!etag) throwCosmos(412, 'Missing ETag for conditional write');
  return { accessCondition: { type: 'IfMatch', condition: etag } };
}

function sameReservation(left, right) {
  const fields = [
    'idempotencyKey',
    'roleId',
    'clientSubmissionId',
    'applicationReference',
    'fileReference',
    'quarantineBlobPath',
    'expectedExtension',
    'expectedSizeBytes',
    'expectedMimeType',
    'privacyNoticeVersion',
    'requestFingerprint'
  ];
  return Boolean(left && right && fields.every((field) => left[field] === right[field]));
}

function outboxDocument(event, applicationReference, nowUtc) {
  return {
    id: `outbox:${event.type}:${event.idempotencyKey}`,
    docType: 'outbox',
    state: 'Pending',
    attemptCount: 0,
    applicationReference,
    createdAtUtc: nowUtc,
    updatedAtUtc: nowUtc,
    ...event
  };
}

function createCosmosAdapters({ endpoint, databaseId, credential, client, now = () => new Date() } = {}) {
  const cosmosClient = client || (endpoint && credential
    ? new (require('@azure/cosmos').CosmosClient)({ endpoint, aadCredentials: credential })
    : null);
  if (!cosmosClient) throw new Error('cosmos unavailable');

  const database = cosmosClient.database(databaseId);
  const submissions = database.container('submissions');
  const idempotencyContainer = database.container('idempotency');

  async function read(container, id, partitionKey) {
    try {
      const response = await container.item(id, partitionKey).read();
      return response.resource || null;
    } catch (error) {
      if (errorCode(error) === 404) return null;
      throw error;
    }
  }

  async function conditionalReplace(container, document, partitionKey, patch = {}) {
    if (!document) return null;
    const replacement = {
      ...stripSystemFields(document),
      ...patch,
      updatedAtUtc: patch.updatedAtUtc || now().toISOString()
    };
    try {
      const response = await container
        .item(document.id, partitionKey)
        .replace(replacement, ifMatch(document._etag));
      return response.resource || replacement;
    } catch (error) {
      if (errorCode(error) === 412) return null;
      throw error;
    }
  }

  async function replaceWithRetry(container, id, partitionKey, buildPatch, attempts = 3) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const current = await read(container, id, partitionKey);
      if (!current) return null;
      const updated = await conditionalReplace(container, current, partitionKey, buildPatch(current));
      if (updated) return updated;
    }
    throwCosmos(412, 'Conditional update contention');
  }

  const applicationStore = {
    async reserveSubmission(reservation) {
      const key = reservation.idempotencyKey;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const existing = await read(idempotencyContainer, key, key);
        if (existing) {
          if (existing.requestFingerprint && existing.requestFingerprint !== reservation.requestFingerprint) {
            throwCosmos(409, 'Reservation fingerprint conflict');
          }
          if (existing.reservation) {
            if (!sameReservation(existing.reservation, reservation)) {
              throwCosmos(409, 'Reservation integrity conflict');
            }
            return clone(existing.reservation);
          }
          const updated = await conditionalReplace(idempotencyContainer, existing, key, {
            state: 'SubmissionReserved',
            requestFingerprint: reservation.requestFingerprint,
            reservation
          });
          if (updated) return clone(reservation);
          continue;
        }

        const timestamp = now().toISOString();
        const document = {
          id: key,
          idempotencyKey: key,
          docType: 'idempotency',
          state: 'SubmissionReserved',
          requestFingerprint: reservation.requestFingerprint,
          reservation,
          createdAtUtc: reservation.createdAtUtc || timestamp,
          updatedAtUtc: timestamp
        };
        try {
          await idempotencyContainer.items.create(document);
          return clone(reservation);
        } catch (error) {
          if (errorCode(error) !== 409) throw error;
        }
      }
      throwCosmos(412, 'Unable to reserve submission');
    },

    async createInitialRecords({ application, file, idempotencyKey, reservation }) {
      const partitionKey = application.applicationReference;
      const timestamp = now().toISOString();
      const applicationDocument = {
        id: 'application',
        docType: 'application',
        aggregateVersion: 0,
        ...application,
        idempotencyKey,
        createdAtUtc: application.createdAtUtc || timestamp,
        updatedAtUtc: application.lastUpdatedAtUtc || timestamp
      };
      const fileDocument = {
        id: `file:${file.fileReference}`,
        docType: 'file',
        ...file,
        createdAtUtc: file.createdAtUtc || timestamp,
        updatedAtUtc: file.lastUpdatedAtUtc || timestamp
      };

      try {
        const response = await submissions.items.batch([
          { operationType: 'Create', resourceBody: applicationDocument },
          { operationType: 'Create', resourceBody: fileDocument }
        ], partitionKey);
        assertBatchSuccess(response);
        return { application, file };
      } catch (error) {
        if (errorCode(error) !== 409) throw error;
        const existingApplication = await read(submissions, 'application', partitionKey);
        const existingFile = await read(submissions, `file:${file.fileReference}`, partitionKey);
        const expected = reservation || await applicationStore.getReservation(idempotencyKey);
        const valid = expected && existingApplication && existingFile &&
          existingApplication.roleId === expected.roleId &&
          existingApplication.idempotencyKey === idempotencyKey &&
          existingApplication.privacyNoticeVersion === expected.privacyNoticeVersion &&
          existingApplication.requestFingerprint === expected.requestFingerprint &&
          existingFile.fileReference === expected.fileReference &&
          existingFile.applicationReference === expected.applicationReference &&
          existingFile.quarantineBlobPath === expected.quarantineBlobPath &&
          existingFile.sizeBytes === expected.expectedSizeBytes &&
          existingFile.declaredMimeType === expected.expectedMimeType &&
          existingFile.requestFingerprint === expected.requestFingerprint;
        if (!valid) throwCosmos(409, 'Initial record integrity conflict');
        return { application: existingApplication, file: existingFile };
      }
    },

    async commitAggregate({ expectedVersion, application, files, outboxEvents = [] }) {
      if (application.aggregateVersion !== expectedVersion) {
        throwCosmos(412, 'Aggregate version mismatch');
      }
      if (!application._etag || files.some((file) => !file._etag)) {
        throwCosmos(412, 'Missing ETag for aggregate write');
      }

      const partitionKey = application.applicationReference;
      const timestamp = now().toISOString();
      const nextApplication = {
        ...stripSystemFields(application),
        id: 'application',
        docType: 'application',
        aggregateVersion: expectedVersion + 1,
        lastUpdatedAtUtc: application.lastUpdatedAtUtc || timestamp,
        updatedAtUtc: timestamp
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
            id: `file:${file.fileReference}`,
            docType: 'file',
            updatedAtUtc: timestamp
          }
        });
      }
      for (const event of outboxEvents) {
        operations.push({
          operationType: 'Create',
          resourceBody: outboxDocument(event, partitionKey, timestamp)
        });
      }

      const response = await submissions.items.batch(operations, partitionKey);
      assertBatchSuccess(response);
      return { application: nextApplication, files: files.map(stripSystemFields) };
    },

    getApplication(applicationReference) {
      return read(submissions, 'application', applicationReference);
    },

    async getFile(fileReference) {
      const query = {
        query: 'SELECT TOP 1 * FROM c WHERE c.docType = @type AND c.fileReference = @fileReference',
        parameters: [
          { name: '@type', value: 'file' },
          { name: '@fileReference', value: fileReference }
        ]
      };
      const { resources } = await submissions.items.query(query, { maxItemCount: 1 }).fetchAll();
      return resources[0] || null;
    },

    async getReservation(idempotencyKey) {
      const document = await read(idempotencyContainer, idempotencyKey, idempotencyKey);
      return document?.reservation || null;
    },

    async hasOutboxEvent({ applicationReference, idempotencyKey, type }) {
      return Boolean(await read(submissions, `outbox:${type}:${idempotencyKey}`, applicationReference));
    },

    async claimCleanupBatch({ limit = 10, owner, leaseExpiresAtUtc }) {
      const timestamp = now().toISOString();
      const query = {
        query: `SELECT TOP @limit * FROM c
          WHERE c.docType = 'file'
          AND c.quarantineRemovalPending = true
          AND (NOT IS_DEFINED(c.cleanupLeaseExpiresAtUtc) OR c.cleanupLeaseExpiresAtUtc < @now)`,
        parameters: [
          { name: '@limit', value: limit },
          { name: '@now', value: timestamp }
        ]
      };
      const { resources } = await submissions.items.query(query, { maxItemCount: limit }).fetchAll();
      const claimed = [];
      for (const file of resources) {
        const updated = await conditionalReplace(submissions, file, file.applicationReference, {
          cleanupLeaseOwner: owner,
          cleanupLeaseExpiresAtUtc: leaseExpiresAtUtc,
          cleanupAttemptCount: (file.cleanupAttemptCount || 0) + 1
        });
        if (updated) claimed.push(updated);
      }
      return claimed;
    },

    async claimOutboxBatch({ limit = 10, owner, leaseExpiresAtUtc }) {
      const timestamp = now().toISOString();
      const query = {
        query: `SELECT TOP @limit * FROM c
          WHERE c.docType = 'outbox'
          AND (
            c.state = 'Pending'
            OR (c.state = 'Processing' AND c.leaseExpiresAtUtc < @now)
          )
          AND (NOT IS_DEFINED(c.nextAttemptAtUtc) OR c.nextAttemptAtUtc <= @now)`,
        parameters: [
          { name: '@limit', value: limit },
          { name: '@now', value: timestamp }
        ]
      };
      const { resources } = await submissions.items.query(query, { maxItemCount: limit }).fetchAll();
      const claimed = [];
      for (const event of resources) {
        const updated = await conditionalReplace(submissions, event, event.applicationReference, {
          state: 'Processing',
          leaseOwner: owner,
          leaseExpiresAtUtc,
          attemptCount: (event.attemptCount || 0) + 1,
          lastAttemptAtUtc: timestamp,
          lastErrorCode: null
        });
        if (updated) claimed.push(updated);
      }
      return claimed;
    },

    completeOutboxEvent(event, delivery = {}) {
      return conditionalReplace(submissions, event, event.applicationReference, {
        state: 'Completed',
        leaseOwner: null,
        leaseExpiresAtUtc: null,
        completedAtUtc: now().toISOString(),
        deliveryReference: delivery.deliveryReference || null,
        lastErrorCode: null
      });
    },

    retryOutboxEvent(event, deliveryErrorCode, nextAttemptAtUtc) {
      return conditionalReplace(submissions, event, event.applicationReference, {
        state: 'Pending',
        leaseOwner: null,
        leaseExpiresAtUtc: null,
        nextAttemptAtUtc,
        lastErrorCode: deliveryErrorCode || 'DELIVERY_RETRYABLE'
      });
    },

    failOutboxEvent(event, deliveryErrorCode) {
      return conditionalReplace(submissions, event, event.applicationReference, {
        state: 'Failed',
        leaseOwner: null,
        leaseExpiresAtUtc: null,
        failedAtUtc: now().toISOString(),
        lastErrorCode: deliveryErrorCode || 'DELIVERY_FAILED'
      });
    }
  };

  const idempotency = {
    async claim(key, owner, leaseExpiresAtUtc, requestFingerprint) {
      const timestamp = now().toISOString();
      const initial = {
        id: key,
        idempotencyKey: key,
        docType: 'idempotency',
        state: 'Claimed',
        leaseOwner: owner,
        leaseExpiresAtUtc,
        requestFingerprint,
        createdAtUtc: timestamp,
        updatedAtUtc: timestamp
      };
      try {
        const response = await idempotencyContainer.items.create(initial);
        return { status: 'claimed', record: response.resource || initial };
      } catch (error) {
        if (errorCode(error) !== 409) throw error;
      }

      const current = await read(idempotencyContainer, key, key);
      if (!current) return { status: 'in_progress', retryAfterMs: 1000 };
      if (current.requestFingerprint && current.requestFingerprint !== requestFingerprint) return { status: 'conflict' };
      if (['CredentialsIssued', 'SubmissionReserved', 'CredentialRetryable', 'RetryableFailure'].includes(current.state)) {
        return { status: 'reserved', reservation: current.reservation, record: current };
      }
      if (['Claimed', 'CredentialIssuing'].includes(current.state) && Date.parse(current.leaseExpiresAtUtc) > now().getTime()) {
        return { status: 'in_progress', retryAfterMs: 1000 };
      }
      const claimed = await conditionalReplace(idempotencyContainer, current, key, {
        state: 'Claimed',
        leaseOwner: owner,
        leaseExpiresAtUtc,
        requestFingerprint
      });
      return claimed
        ? { status: 'claimed', record: claimed, reservation: claimed.reservation }
        : { status: 'in_progress', retryAfterMs: 1000 };
    },

    get(key) {
      return read(idempotencyContainer, key, key);
    },

    async recordReservation(key, reservation) {
      const updated = await replaceWithRetry(idempotencyContainer, key, key, (current) => {
        if (current.requestFingerprint && current.requestFingerprint !== reservation.requestFingerprint) {
          throwCosmos(409, 'Reservation fingerprint conflict');
        }
        if (current.reservation && !sameReservation(current.reservation, reservation)) {
          throwCosmos(409, 'Reservation integrity conflict');
        }
        return {
          state: 'SubmissionReserved',
          reservation,
          requestFingerprint: reservation.requestFingerprint
        };
      });
      if (!updated) throwCosmos(404, 'Missing idempotency record');
      return updated;
    },

    async beginCredentialIssuance(key, owner, leaseExpiresAtUtc) {
      const current = await read(idempotencyContainer, key, key);
      if (!current) return { status: 'missing' };
      if (current.state === 'CredentialIssuing' && Date.parse(current.leaseExpiresAtUtc) > now().getTime()) {
        return { status: 'in_progress', retryAfterMs: 1000 };
      }
      const generation = (current.credentialGeneration || current.reservation?.credentialGeneration || 0) + 1;
      const updated = await conditionalReplace(idempotencyContainer, current, key, {
        state: 'CredentialIssuing',
        leaseOwner: owner,
        leaseExpiresAtUtc,
        credentialGeneration: generation
      });
      return updated
        ? { status: 'claimed', generation, record: updated }
        : { status: 'in_progress', retryAfterMs: 1000 };
    },

    async credentialsIssued(key, result, stableResult) {
      const updated = await replaceWithRetry(idempotencyContainer, key, key, (current) => ({
        state: 'CredentialsIssued',
        result,
        stableResult,
        leaseOwner: null,
        leaseExpiresAtUtc: null,
        reservation: {
          ...(current.reservation || {}),
          credentialGeneration: stableResult.credentialGeneration,
          lastCredentialExpiryUtc: stableResult.lastCredentialExpiryUtc,
          reservationState: 'CredentialsIssued'
        }
      }));
      if (!updated) throwCosmos(404, 'Missing idempotency record');
      return updated;
    },

    credentialRetryableFailure(key, reason) {
      return replaceWithRetry(idempotencyContainer, key, key, () => ({
        state: 'CredentialRetryable',
        reason,
        leaseOwner: null,
        leaseExpiresAtUtc: null
      }));
    },

    retryableFailure(key, reason) {
      return replaceWithRetry(idempotencyContainer, key, key, () => ({
        state: 'RetryableFailure',
        reason,
        leaseOwner: null,
        leaseExpiresAtUtc: null
      }));
    },

    permanentFailure(key, reason) {
      return replaceWithRetry(idempotencyContainer, key, key, () => ({
        state: 'PermanentFailure',
        reason,
        leaseOwner: null,
        leaseExpiresAtUtc: null
      }));
    }
  };

  function claimPartitionKey(prefix, key) {
    if (prefix === 'completion') return key.split(':')[1];
    return key.split(':')[1];
  }

  function claims(prefix) {
    return {
      async claim(key, ownerOrMetadata, leaseExpiresAtUtc) {
        const partitionKey = claimPartitionKey(prefix, key);
        const id = `${prefix}:${key}`;
        const metadata = typeof ownerOrMetadata === 'object'
          ? ownerOrMetadata
          : { leaseOwner: ownerOrMetadata, leaseExpiresAtUtc };
        const timestamp = now().toISOString();
        const initial = {
          id,
          applicationReference: partitionKey,
          docType: prefix,
          key,
          state: 'Processing',
          attemptCount: 1,
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
          ...metadata
        };
        try {
          const response = await submissions.items.create(initial);
          return { status: 'claimed', record: response.resource || initial };
        } catch (error) {
          if (errorCode(error) !== 409) throw error;
        }

        const current = await read(submissions, id, partitionKey);
        if (current?.state === 'Completed') return { status: 'completed', result: current.result };
        if (current?.state === 'PermanentFailure') return { status: 'permanent_failure', result: current.result };
        if (current?.state === 'Processing' && Date.parse(current.leaseExpiresAtUtc) > now().getTime()) {
          return { status: 'in_progress', retryAfterMs: 1000 };
        }
        const updated = await conditionalReplace(submissions, current, partitionKey, {
          state: 'Processing',
          attemptCount: (current?.attemptCount || 0) + 1,
          ...metadata
        });
        return updated
          ? { status: 'claimed', record: updated }
          : { status: 'in_progress', retryAfterMs: 1000 };
      },

      async complete(key, result) {
        const partitionKey = claimPartitionKey(prefix, key);
        const id = `${prefix}:${key}`;
        const updated = await replaceWithRetry(submissions, id, partitionKey, () => ({
          state: 'Completed',
          result,
          completedAtUtc: now().toISOString(),
          leaseOwner: null,
          leaseExpiresAtUtc: null
        }));
        if (!updated) throwCosmos(404, 'Missing claim record');
        return updated;
      },

      retryableFailure(key, reason) {
        const partitionKey = claimPartitionKey(prefix, key);
        return replaceWithRetry(submissions, `${prefix}:${key}`, partitionKey, () => ({
          state: 'RetryableFailure',
          reason,
          leaseOwner: null,
          leaseExpiresAtUtc: null
        }));
      },

      permanentFailure(key, reason) {
        const partitionKey = claimPartitionKey(prefix, key);
        return replaceWithRetry(submissions, `${prefix}:${key}`, partitionKey, () => ({
          state: 'PermanentFailure',
          reason,
          result: { success: false, errorCode: reason },
          leaseOwner: null,
          leaseExpiresAtUtc: null
        }));
      }
    };
  }

  return {
    applicationStore,
    idempotency,
    completionClaims: claims('completion'),
    scanEvents: claims('scan'),
    mapCosmosError,
    async health() {
      await database.read();
      return { ok: true };
    }
  };
}

module.exports = {
  createCosmosAdapters,
  mapCosmosError,
  stripSystemFields,
  assertBatchSuccess,
  outboxDocument,
  sameReservation
};
