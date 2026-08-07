'use strict';

const { stripSystemFields } = require('./cosmos');

function createOutboxCheckpointStore({ endpoint, databaseId, credential, client, now = () => new Date() } = {}) {
  const cosmosClient = client || (endpoint && credential
    ? new (require('@azure/cosmos').CosmosClient)({ endpoint, aadCredentials: credential })
    : null);
  if (!cosmosClient) throw new Error('cosmos unavailable');

  const submissions = cosmosClient.database(databaseId).container('submissions');

  async function checkpoint(event, deliveryCheckpoint) {
    if (!event?._etag || !event?.id || !event?.applicationReference) {
      throw Object.assign(new Error('Outbox checkpoint requires a leased event with ETag'), {
        code: 'OUTBOX_CHECKPOINT_INVALID',
        permanent: true
      });
    }
    const replacement = {
      ...stripSystemFields(event),
      state: 'Processing',
      deliveryCheckpoint: {
        ...(event.deliveryCheckpoint || {}),
        ...(deliveryCheckpoint || {})
      },
      updatedAtUtc: now().toISOString()
    };
    try {
      const response = await submissions
        .item(event.id, event.applicationReference)
        .replace(replacement, {
          accessCondition: {
            type: 'IfMatch',
            condition: event._etag
          }
        });
      return response.resource || replacement;
    } catch (error) {
      if (Number(error?.code || error?.statusCode || 0) === 412) {
        throw Object.assign(new Error('Outbox checkpoint lost its lease'), {
          code: 'OUTBOX_CHECKPOINT_CONFLICT'
        });
      }
      throw error;
    }
  }

  return { checkpoint };
}

module.exports = { createOutboxCheckpointStore };
