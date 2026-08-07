using 'event-grid-subscription.bicep'

param topicName = 'svplaceholder-recruit-scan-dev'
param functionAppName = 'svplaceholder-recruit-fn-dev'
param functionName = 'defenderScanResult'
param eventSubscriptionName = 'defender-malware-results'
param maxDeliveryAttempts = 30
param eventTimeToLiveInMinutes = 1440
