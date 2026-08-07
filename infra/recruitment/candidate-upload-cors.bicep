targetScope = 'resourceGroup'

@description('Existing recruitment CV storage account.')
param storageAccountName string

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: [
            'https://shorevest.com'
            'https://www.shorevest.com'
          ]
          allowedMethods: [
            'OPTIONS'
            'PUT'
          ]
          allowedHeaders: [
            'content-type'
            'x-ms-*'
          ]
          exposedHeaders: [
            'etag'
            'x-ms-request-id'
            'x-ms-version'
          ]
          maxAgeInSeconds: 300
        }
      ]
    }
  }
}

output blobServiceId string = blobService.id
