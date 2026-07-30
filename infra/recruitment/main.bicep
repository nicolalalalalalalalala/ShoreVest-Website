targetScope = 'resourceGroup'

@description('Environment name, e.g. dev/test/prod.')
param environmentName string

@description('Short globally unique name prefix. No real subscription or tenant IDs are committed.')
param namePrefix string

@description('Location for all resources.')
param location string = resourceGroup().location

@description('Paid Microsoft Defender for Storage malware scanning. Explicit opt-in only.')
param enableDefenderForStorage bool = false

@description('Name of the Key Vault secret used to sign upload-completion tokens.')
param completionTokenSecretName string = 'recruitment-completion-token-key'

@description('Name of the Key Vault secret used to HMAC request fingerprints and rate-limit keys.')
param fingerprintSecretName string = 'recruitment-fingerprint-key'

@description('Name of the Key Vault secret containing the Cloudflare Turnstile secret.')
param botVerificationSecretName string = 'recruitment-turnstile-secret'

@description('Expected Turnstile token hostname. Override for non-production test environments.')
param botVerificationHostname string = 'shorevest.com'

@minValue(1)
@description('Maximum application-initiation requests permitted per fixed window and server-derived client key.')
param rateLimitCount int = 5

@minValue(60)
@description('Fixed rate-limit window length in seconds.')
param rateLimitWindowSeconds int = 300

@minValue(1024)
@description('Maximum accepted JSON request body size in bytes.')
param maxBodyBytes int = 65536

@minValue(1)
@maxValue(100)
@description('Maximum Flex Consumption instance count.')
param maximumInstanceCount int = 20

@allowed([
  512
  2048
  4096
])
@description('Flex Consumption instance memory in MB.')
param instanceMemoryMB int = 2048

@allowed([
  '22'
  '24'
])
@description('Supported Node.js runtime version for the Flex Consumption Function App.')
param nodeRuntimeVersion string = '24'

@description('Use Cosmos DB serverless capacity. Recommended for dev/test. Capacity mode cannot be changed after account creation.')
param enableCosmosServerless bool = false

@minValue(400)
@description('Shared database throughput when serverless capacity is disabled.')
param cosmosSharedThroughput int = 400

var tags = {
  workload: 'recruitment'
  phase: '2B.1'
  environment: environmentName
}
var runtimeEnvironment = environmentName == 'prod' ? 'production' : environmentName
var functionName = '${namePrefix}-recruit-fn-${environmentName}'
var identityName = '${namePrefix}-recruit-mi-${environmentName}'
var deploymentContainerName = 'recruitment-functions'
var quarantineContainerName = 'recruitment-quarantine'
var cleanContainerName = 'recruitment-clean'
var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var storageBlobDelegatorRoleId = 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a'
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6c'

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
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }
}

resource deployBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: deployStorage
  name: 'default'
}

resource deploymentPackages 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: deployBlobService
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
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
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    // Candidate browsers upload directly to one exact blob using a short-lived,
    // write-only user-delegation SAS. Network reachability must therefore remain
    // public while anonymous container access and Shared Key access stay disabled.
    publicNetworkAccess: 'Enabled'
  }
}

resource cvBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: cvStorage
  name: 'default'
}

resource quarantine 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: cvBlobService
  name: quarantineContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource clean 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: cvBlobService
  name: cleanContainerName
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
    publicNetworkAccess: 'Enabled'
    capabilities: enableCosmosServerless ? [
      {
        name: 'EnableServerless'
      }
    ] : []
  }
}

resource db 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'recruitment'
  properties: {
    resource: {
      id: 'recruitment'
    }
    options: enableCosmosServerless ? {} : {
      throughput: cosmosSharedThroughput
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
    options: {}
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
    options: {}
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
    options: {}
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${namePrefix}-recruit-kv-${environmentName}'
  location: location
  tags: tags
  properties: union({
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enabledForTemplateDeployment: false
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
  }, environmentName == 'prod' ? {
    enablePurgeProtection: true
  } : {})
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
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
  }
}

// Functions host and deployment package storage, both using the assigned identity.
resource deployStorageBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(deployStorage.id, mi.id, 'functions-host-storage')
  scope: deployStorage
  properties: {
    principalId: mi.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRoleId)
  }
}

// User-delegation key generation is account scoped; Blob data access is restricted
// to the two recruitment containers rather than the entire storage account.
resource cvStorageBlobDelegator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(cvStorage.id, mi.id, 'recruitment-blob-delegator')
  scope: cvStorage
  properties: {
    principalId: mi.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDelegatorRoleId)
  }
}

resource quarantineBlobData 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(quarantine.id, mi.id, 'recruitment-quarantine-blob-data')
  scope: quarantine
  properties: {
    principalId: mi.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

resource cleanBlobData 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(clean.id, mi.id, 'recruitment-clean-blob-data')
  scope: clean
  properties: {
    principalId: mi.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

resource cosmosData 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, mi.id, 'cosmos-data')
  properties: {
    principalId: mi.properties.principalId
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    scope: cosmos.id
  }
}

resource kvSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, mi.id, 'kv-secrets-user')
  scope: vault
  properties: {
    principalId: mi.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: tenantResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
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
    publicNetworkAccess: 'Enabled'
    keyVaultReferenceIdentity: mi.id
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${deployStorage.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: mi.id
          }
        }
      }
      runtime: {
        name: 'node'
        version: nodeRuntimeVersion
      }
      scaleAndConcurrency: {
        maximumInstanceCount: maximumInstanceCount
        instanceMemoryMB: instanceMemoryMB
      }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      appSettings: [
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'AzureWebJobsStorage__accountName'
          value: deployStorage.name
        }
        {
          name: 'AzureWebJobsStorage__credential'
          value: 'managedidentity'
        }
        {
          name: 'AzureWebJobsStorage__clientId'
          value: mi.properties.clientId
        }
        {
          name: 'AZURE_CLIENT_ID'
          value: mi.properties.clientId
        }
        {
          name: 'RECRUITMENT_MANAGED_IDENTITY_CLIENT_ID'
          value: mi.properties.clientId
        }
        {
          name: 'RECRUITMENT_API_ENABLED'
          value: 'false'
        }
        {
          name: 'RECRUITMENT_ENVIRONMENT'
          value: runtimeEnvironment
        }
        {
          name: 'RECRUITMENT_ALLOWED_ORIGINS'
          value: 'https://shorevest.com,https://www.shorevest.com'
        }
        {
          name: 'RECRUITMENT_REQUIRE_ORIGIN'
          value: 'true'
        }
        {
          name: 'RECRUITMENT_MAX_BODY_BYTES'
          value: string(maxBodyBytes)
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
          value: cvStorage.properties.primaryEndpoints.blob
        }
        {
          name: 'RECRUITMENT_UPLOAD_STORAGE_ACCOUNT_NAME'
          value: cvStorage.name
        }
        {
          name: 'RECRUITMENT_QUARANTINE_CONTAINER'
          value: quarantineContainerName
        }
        {
          name: 'RECRUITMENT_CLEAN_CONTAINER'
          value: cleanContainerName
        }
        {
          name: 'RECRUITMENT_KEYVAULT_URL'
          value: vault.properties.vaultUri
        }
        {
          name: 'RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME'
          value: completionTokenSecretName
        }
        {
          name: 'RECRUITMENT_FINGERPRINT_SECRET_NAME'
          value: fingerprintSecretName
        }
        {
          name: 'RECRUITMENT_RATE_LIMIT_ENABLED'
          value: 'true'
        }
        {
          name: 'RECRUITMENT_RATE_LIMIT_COUNT'
          value: string(rateLimitCount)
        }
        {
          name: 'RECRUITMENT_RATE_LIMIT_WINDOW_SECONDS'
          value: string(rateLimitWindowSeconds)
        }
        {
          name: 'RECRUITMENT_BOT_VERIFICATION_MODE'
          value: 'turnstile'
        }
        {
          name: 'RECRUITMENT_BOT_VERIFICATION_SECRET_NAME'
          value: botVerificationSecretName
        }
        {
          name: 'RECRUITMENT_BOT_VERIFICATION_HOSTNAME'
          value: botVerificationHostname
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: ai.properties.ConnectionString
        }
      ]
    }
  }
  dependsOn: [
    deploymentPackages
    deployStorageBlobOwner
    cvStorageBlobDelegator
    quarantineBlobData
    cleanBlobData
    cosmosData
    kvSecrets
  ]
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
output managedIdentityClientId string = mi.properties.clientId
output deploymentContainerUrl string = '${deployStorage.properties.primaryEndpoints.blob}${deploymentContainerName}'
output recruitmentStorageAccountName string = cvStorage.name
output keyVaultName string = vault.name