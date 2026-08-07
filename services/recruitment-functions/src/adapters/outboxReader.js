'use strict';

function createOutboxReader({ endpoint, databaseId, credential, client } = {}) {
  const cosmosClient = client || (endpoint && credential
    ? new (require('@azure/cosmos').CosmosClient)({ endpoint, aadCredentials: credential })
    : null);
  if (!cosmosClient) throw new Error('cosmos unavailable');
  const submissions = cosmosClient.database(databaseId).container('submissions');

  return {
    async get({ applicationReference, idempotencyKey, type }) {
      if (![applicationReference, idempotencyKey, type].every(
        (value) => typeof value === 'string' && value.length > 0
      )) {
        throw new TypeError('outbox identity is incomplete');
      }
      try {
        const response = await submissions
          .item(`outbox:${type}:${idempotencyKey}`, applicationReference)
          .read();
        return response.resource || null;
      } catch (error) {
        if (Number(error?.code || error?.statusCode) === 404) return null;
        throw error;
      }
    }
  };
}

module.exports = { createOutboxReader };
