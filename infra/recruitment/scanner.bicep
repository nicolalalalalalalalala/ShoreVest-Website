targetScope = 'resourceGroup'

// Self-hosted ClamAV CV malware scanner (free alternative to paid Defender for
// Storage on-upload scanning). Deploy this SEPARATELY from main.bicep, after the
// core recruitment stack exists:
//
//   az deployment group create -g <rg> \
//     --template-file infra/recruitment/scanner.bicep \
//     --parameters namePrefix=<p> environmentName=<env> \
//                  cvStorageAccountName=<acct> managedIdentityName=<mi> \
//                  logAnalyticsWorkspaceName=<law> containerImage=<registry>/recruitment-clamav:<tag>
//
// Validate first with:  az bicep build --file infra/recruitment/scanner.bicep
// and preview with:     az deployment group what-if ...
//
// Networking note: this assumes the CV storage account is reachable over its
// public endpoint with AAD auth (the deployed test account is). If the account
// is later restricted to private networking, add a VNet-integrated Container Apps
// environment with private endpoints for the blob and queue services.

@description('Short name prefix used by the core recruitment stack.')
param namePrefix string

@description('Environment name, e.g. dev/test/prod.')
param environmentName string

@description('Location for all resources.')
param location string = resourceGroup().location

@description('Existing CV storage account (holds recruitment-quarantine and recruitment-clean).')
param cvStorageAccountName string

@description('Existing user-assigned managed identity shared with the Functions app.')
param managedIdentityName string

@description('Existing Log Analytics workspace for the Container Apps environment.')
param logAnalyticsWorkspaceName string

@description('Existing Cosmos DB account name (defaults to the core stack naming).')
param cosmosAccountName string = '${namePrefix}-recruit-cosmos-${environmentName}'

@description('Full container image reference for the scanner, e.g. myregistry.azurecr.io/recruitment-clamav:1.')
param containerImage string

@description('Optional container registry login server (set to enable managed-identity pull). Grant the identity AcrPull on the registry separately.')
param registryServer string = ''

@description('Scan queue name (Event Grid delivers quarantine BlobCreated events here).')
param scanQueueName string = 'recruitment-scan-events'

@description('Minimum replicas. 0 lets the app scale to zero when idle (free-tier friendly).')
@minValue(0)
param minReplicas int = 0

@description('Maximum concurrent scanner replicas.')
@minValue(1)
param maxReplicas int = 3

var tags = {
  workload: 'recruitment'
  component: 'clamav-scanner'
  environment: environmentName
}

// Built-in role definition IDs.
var storageQueueDataContributor = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var storageQueueDataMessageSender = 'c6a89b2d-59bc-44d0-9896-0f6e12d7b422'

resource cvStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: cvStorageAccountName
}

resource mi 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: managedIdentityName
}

resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

// Storage Queue that buffers scan work. Event Grid writes here; the worker drains it.
resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' existing = {
  parent: cvStorage
  name: 'default'
}

resource scanQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: scanQueueName
}

// Event Grid system topic for the CV storage account, with a system-assigned
// identity used to deliver events into the queue.
resource systemTopic 'Microsoft.EventGrid/systemTopics@2023-12-15-preview' = {
  name: '${namePrefix}-recruit-cvtopic-${environmentName}'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    source: cvStorage.id
    topicType: 'Microsoft.Storage.StorageAccounts'
  }
}

// Deliver only BlobCreated events for the quarantine CV prefix to the scan queue.
resource scanSubscription 'Microsoft.EventGrid/systemTopics/eventSubscriptions@2023-12-15-preview' = {
  parent: systemTopic
  name: 'recruitment-quarantine-scan'
  properties: {
    deliveryWithResourceIdentity: {
      identity: {
        type: 'SystemAssigned'
      }
      destination: {
        endpointType: 'StorageQueue'
        properties: {
          resourceId: cvStorage.id
          queueName: scanQueueName
        }
      }
    }
    filter: {
      includedEventTypes: [
        'Microsoft.Storage.BlobCreated'
      ]
      subjectBeginsWith: '/blobServices/default/containers/recruitment-quarantine/blobs/recruitment/'
      enableAdvancedFilteringOnArrays: true
    }
    eventDeliverySchema: 'EventGridSchema'
    retryPolicy: {
      maxDeliveryAttempts: 30
      eventTimeToLiveInMinutes: 1440
    }
  }
  dependsOn: [
    scanQueue
    topicQueueSender
  ]
}

// The Event Grid system topic identity must be allowed to write queue messages.
resource topicQueueSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(cvStorage.id, systemTopic.id, 'queue-sender')
  scope: cvStorage
  properties: {
    principalId: systemTopic.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageQueueDataMessageSender)
  }
}

// The worker identity must be allowed to read and delete queue messages.
resource workerQueueContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(cvStorage.id, mi.id, 'queue-contributor')
  scope: cvStorage
  properties: {
    principalId: mi.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageQueueDataContributor)
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-recruit-cae-${environmentName}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    }
  }
}

resource scanner 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-recruit-clamav-${environmentName}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${mi.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      // No ingress: the scanner is a queue worker; clamd is reached only on
      // localhost inside the container, so nothing is exposed to the network.
      registries: empty(registryServer) ? [] : [
        {
          server: registryServer
          identity: mi.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'clamav-scanner'
          image: containerImage
          resources: {
            // ClamAV needs ~1 vCPU / 2GiB to hold virus definitions in memory.
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            { name: 'CLAMAV_HOST', value: '127.0.0.1' }
            { name: 'CLAMAV_PORT', value: '3310' }
            { name: 'AZURE_CLIENT_ID', value: mi.properties.clientId }
            { name: 'RECRUITMENT_MANAGED_IDENTITY_CLIENT_ID', value: mi.properties.clientId }
            { name: 'RECRUITMENT_ENVIRONMENT', value: environmentName }
            { name: 'RECRUITMENT_STORAGE_ACCOUNT_URL', value: 'https://${cvStorage.name}.blob.${environment().suffixes.storage}' }
            { name: 'RECRUITMENT_UPLOAD_STORAGE_ACCOUNT_NAME', value: cvStorage.name }
            { name: 'RECRUITMENT_QUARANTINE_CONTAINER', value: 'recruitment-quarantine' }
            { name: 'RECRUITMENT_CLEAN_CONTAINER', value: 'recruitment-clean' }
            { name: 'RECRUITMENT_SCAN_QUEUE_URL', value: 'https://${cvStorage.name}.queue.${environment().suffixes.storage}/${scanQueueName}' }
            { name: 'RECRUITMENT_COSMOS_ENDPOINT', value: 'https://${cosmosAccountName}.documents.azure.com:443/' }
            { name: 'RECRUITMENT_COSMOS_DATABASE', value: 'recruitment' }
            { name: 'RECRUITMENT_NOTIFICATIONS_ENABLED', value: 'false' }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'scan-queue-depth'
            azureQueue: {
              accountName: cvStorage.name
              queueName: scanQueueName
              queueLength: 1
              identity: mi.id
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    workerQueueContributor
  ]
}

output scannerAppName string = scanner.name
output scanQueueUrl string = 'https://${cvStorage.name}.queue.${environment().suffixes.storage}/${scanQueueName}'
output eventGridSystemTopic string = systemTopic.name
