'use strict';

function createProjectionReader({ endpoint, databaseId, credential, client } = {}) {
  const cosmosClient = client || (endpoint && credential
    ? new (require('@azure/cosmos').CosmosClient)({ endpoint, aadCredentials: credential })
    : null);
  if (!cosmosClient) throw new Error('cosmos unavailable');

  const submissions = cosmosClient.database(databaseId).container('submissions');

  async function getFilesForApplication(applicationReference) {
    if (typeof applicationReference !== 'string' || !applicationReference) return [];
    const query = {
      query: 'SELECT * FROM c WHERE c.docType = @type ORDER BY c.createdAtUtc ASC',
      parameters: [{ name: '@type', value: 'file' }]
    };
    const { resources } = await submissions.items
      .query(query, { partitionKey: applicationReference, maxItemCount: 20 })
      .fetchAll();
    return Array.isArray(resources) ? resources : [];
  }

  return { getFilesForApplication };
}

module.exports = { createProjectionReader };
