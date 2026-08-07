targetScope = 'resourceGroup'

@description('Environment name, e.g. dev/test/prod.')
param environmentName string

@description('Short globally unique name prefix. No real subscription or tenant IDs are committed.')
param namePrefix string

@description('Location for all resources.')
param location string = resourceGroup().location

@description('Paid Microsoft Defender for Storage malware scanning. Explicit opt-in only.')
param enableDefenderForStorage bool = false

@description('Function app package URL supplied at deployment time.')
param packageUrl string = ''

var tags = {
  workload: 'recruitment'
  phase: '2B.1'
  environment: environmentName
}
var functionName = '${namePrefix}-recruit-fn-${environmentName}'
var identityName = '${namePrefix}-recruit-mi-${environmentName}'

resource log 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-recruit-law-${environmentName}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource ai 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-recruit-ai-${environmentName}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: log.id
  }
}

resource mi 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

resource deployStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: toLower('${namePrefix}fnpkg${environmentName}')
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource cvStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: toLower('${namePrefix}cv${environmentName}')
  location: location
  tags: tags
  sku: {
    name: 'Standard_ZRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Disabled'
  }
}

resource quarantine 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${cvStorage.name}/default/recruitment-quarantine'
  properties: {
    publicAccess: 'None'
  }
}

resource clean 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${cvStorage.name}/default/recruitment-clean'
  properties: {
    publicAccess: 'None'
  }
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: '${namePrefix}-recruit-cosmos-${environmentName}'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    disableLocalAuth: true
    capabilities: []
  }
}

resource db 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'recruitment'
  properties: {
    resource: {
      id: 'recruitment'
    }
  }
}

resource submissions 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: db
  name: 'submissions'
  properties: {
    resource: {
      id: 'submissions'
      partitionKey: {
        paths: [
          '/applicationReference'
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
      }
    }
  }
}

resource idempotency 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: db
  name: 'idempotency'
  properties: {
    resource: {
      id: 'idempotency'
      partitionKey: {
        paths: [
          '/idempotencyKey'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource rateLimits 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: db
  name: 'rateLimits'
  properties: {
    resource: {
      id: 'rateLimits'
      partitionKey: {
        paths: [
          '/key'
        ]
        kind: 'Hash'
      }
      defaultTtl: 3600
    }
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${namePrefix}-recruit-kv-${environmentName}'
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enabledForTemplateDeployment: false
  }
}

resource topic 'Microsoft.EventGrid/topics@2023-12-15-preview' = {
  name: '${namePrefix}-recruit-scan-${environmentName}'
  location: location
  tags: tags
  properties: {}
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${namePrefix}-recruit-flex-${environmentName}'
  location: location
  tags: tags
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
  }
}

resource fn 'Microsoft.Web/sites@2024-04-01' = {
  name: functionName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${mi.id}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|20'
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: packageUrl
        }
        {
          name: 'RECRUITMENT_API_ENABLED'
          value: 'false'
        }
        {
          name: 'RECRUITMENT_ALLOWED_ORIGINS'
          value: 'https://shorevest.com,https://www.shorevest.com'
        }
        {
          name: 'RECRUITMENT_COSMOS_ENDPOINT'
          value: cosmos.properties.documentEndpoint
        }
        {
          name: 'RECRUITMENT_COSMOS_DATABASE'
          value: 'recruitment'
        }
        {
          name: 'RECRUITMENT_STORAGE_ACCOUNT_URL'
          value: 'https://${cvStorage.name}.blob.${environment().suffixes.storage}'
        }
        {
          name: 'RECRUITMENT_UPLOAD_STORAGE_ACCOUNT_NAME'
          value: cvStorage.name
        }
        {
          name: 'RECRUITMENT_KEYVAULT_URL'
          value: vault.properties.vaultUri
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: ai.properties.ConnectionString
        }
      ]
    }
  }
}

// Cosmos DB Built-in Data Contributor - data-plane access only.
resource cosmosData 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, mi.id, 'cosmos-data')
  properties: {
    principalId: mi.properties.principalId
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    scope: cosmos.id
  }
}

// Storage Blob Data Contributor permits scoped blob read/write/delete and user-delegation SAS generation without account keys.
resource blobData 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(cvStorage.id, mi.id, 'blob-data-contributor')
  scope: cvStorage
  properties: {
    principalId: mi.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
    )
  }
}

// Key Vault Secrets User permits reading only configured secret values, not vault administration.
resource kvSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, mi.id, 'kv-secrets-user')
  scope: vault
  properties: {
    principalId: mi.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6c'
    )
  }
}

// Optional paid Defender for Storage must be explicitly enabled by parameter.
resource defender 'Microsoft.Security/defenderForStorageSettings@2022-12-01-preview' = if (enableDefenderForStorage) {
  name: 'current'
  scope: cvStorage
  properties: {
    isEnabled: true
    malwareScanning: {
      onUpload: {
        isEnabled: true
        capGBPerMonth: 500
      }
      scanResultsEventGridTopicResourceId: topic.id
    }
  }
}

output functionAppName string = fn.name
