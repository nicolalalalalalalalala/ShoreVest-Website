targetScope = 'resourceGroup'

@description('Existing custom Event Grid topic that receives Defender for Storage malware scan results.')
param topicName string

@description('Existing Azure Function App containing the Defender scan result handler.')
param functionAppName string

@description('Deployed Event Grid-triggered Function name.')
param functionName string = 'defenderScanResult'

@description('Event subscription name.')
param eventSubscriptionName string = 'defender-malware-results'

@minValue(1)
@maxValue(30)
@description('Maximum Event Grid delivery attempts before the event expires.')
param maxDeliveryAttempts int = 30

@minValue(1)
@maxValue(1440)
@description('Event delivery time-to-live in minutes.')
param eventTimeToLiveInMinutes int = 1440

resource topic 'Microsoft.EventGrid/topics@2023-12-15-preview' existing = {
  name: topicName
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' existing = {
  name: functionAppName
}

resource scanResultSubscription 'Microsoft.EventGrid/topics/eventSubscriptions@2025-02-15' = {
  parent: topic
  name: eventSubscriptionName
  properties: {
    destination: {
      endpointType: 'AzureFunction'
      properties: {
        resourceId: '${functionApp.id}/functions/${functionName}'
        maxEventsPerBatch: 1
        preferredBatchSizeInKilobytes: 64
      }
    }
    eventDeliverySchema: 'EventGridSchema'
    filter: {
      includedEventTypes: [
        'Microsoft.Security.MalwareScanningResult'
      ]
      isSubjectCaseSensitive: false
    }
    retryPolicy: {
      maxDeliveryAttempts: maxDeliveryAttempts
      eventTimeToLiveInMinutes: eventTimeToLiveInMinutes
    }
  }
}

output eventSubscriptionId string = scanResultSubscription.id
output azureFunctionResourceId string = '${functionApp.id}/functions/${functionName}'
