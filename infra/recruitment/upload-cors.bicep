targetScope = 'resourceGroup'

@description('Existing recruitment CV storage account name.')
param cvStorageAccountName string

@description('Exact browser origins allowed to upload recruitment documents.')
param allowedOrigins array = [
  'https://shorevest.com'
  'https://www.shorevest.com'
]

@minValue(0)
@maxValue(3600)
@description('Browser preflight cache duration in seconds.')
param maxAgeInSeconds int = 600

resource cvStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: cvStorageAccountName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: cvStorage
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: allowedOrigins
          allowedMethods: [
            'OPTIONS'
            'PUT'
          ]
          allowedHeaders: [
            'content-type'
            'x-ms-blob-type'
            'x-ms-client-request-id'
          ]
          exposedHeaders: [
            'etag'
            'x-ms-request-id'
          ]
          maxAgeInSeconds: maxAgeInSeconds
        }
      ]
    }
  }
}

output blobServiceId string = blobService.id
output configuredOrigins array = allowedOrigins
