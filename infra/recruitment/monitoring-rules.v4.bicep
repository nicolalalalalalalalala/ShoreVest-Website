targetScope = 'resourceGroup'

@description('Existing workspace-based Application Insights component for recruitment.')
param applicationInsightsName string

@description('Existing Azure Monitor action group resource ID.')
param actionGroupResourceId string

@description('Deploy the alert rules. Explicit opt-in for each environment.')
param enableAlerts bool = false

@description('Location for scheduled query rule resources.')
param location string = resourceGroup().location

resource insights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
}

// The deployment contract requires workspace-based Application Insights. Alert queries
// therefore begin with one workspace table and return one row per matching telemetry
// record. Scheduled-query Count aggregation applies the threshold across the window.
var criticalEventsQuery = '''
AppTraces
| where Message has_any (
    "recruitment_configuration_invalid",
    "recruitment_outbox_configuration_invalid",
    "recruitment_scan_event_rejected",
    "recruitment_scan_event_retry_requested",
    "recruitment_retention_configuration_invalid",
    "recruitment_retention_purge_failed",
    "recruitment_retention_idempotency_cleanup_failed",
    "finalization_outcome_reconciliation_failed",
    "initiate_abuse_controls_missing"
  )
| project TimeGenerated
'''

var repeatedApiFailuresQuery = '''
AppRequests
| where Name has "recruitment" or Url has "/recruitment/"
| where toint(ResultCode) >= 500
| project TimeGenerated
'''

var readinessFailuresQuery = '''
AppRequests
| where Name has "health" or Url endswith "/recruitment/health"
| where toint(ResultCode) >= 500
| project TimeGenerated
'''

var securityResponseSpikeQuery = '''
AppRequests
| where Name has "recruitment" or Url has "/recruitment/"
| where toint(ResultCode) in (401, 403, 429)
| project TimeGenerated
'''

resource criticalProcessingFailures 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = if (enableAlerts) {
  name: 'recruitment-critical-processing-failures-v4'
  location: location
  properties: {
    displayName: 'Recruitment critical processing failure'
    description: 'Alerts on fail-closed configuration, rejected or retrying Defender delivery, failed retention purge or finalization reconciliation. Query uses event names and counts only.'
    enabled: true
    severity: 1
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [
      insights.id
    ]
    targetResourceTypes: [
      'Microsoft.Insights/components'
    ]
    criteria: {
      allOf: [
        {
          query: criticalEventsQuery
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        actionGroupResourceId
      ]
    }
    autoMitigate: false
    skipQueryValidation: false
  }
}

resource repeatedApiFailures 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = if (enableAlerts) {
  name: 'recruitment-repeated-api-failures-v4'
  location: location
  properties: {
    displayName: 'Recruitment repeated API failures'
    description: 'Alerts when recruitment endpoints return five or more server errors in five minutes. Query returns raw request rows and the alert rule counts them.'
    enabled: true
    severity: 2
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [
      insights.id
    ]
    targetResourceTypes: [
      'Microsoft.Insights/components'
    ]
    criteria: {
      allOf: [
        {
          query: repeatedApiFailuresQuery
          timeAggregation: 'Count'
          operator: 'GreaterThanOrEqual'
          threshold: 5
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        actionGroupResourceId
      ]
    }
    autoMitigate: true
    skipQueryValidation: false
  }
}

resource readinessUnavailable 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = if (enableAlerts) {
  name: 'recruitment-readiness-unavailable-v4'
  location: location
  properties: {
    displayName: 'Recruitment readiness unavailable'
    description: 'Alerts when the recruitment readiness endpoint reports three or more failures within ten minutes.'
    enabled: true
    severity: 2
    evaluationFrequency: 'PT5M'
    windowSize: 'PT10M'
    scopes: [
      insights.id
    ]
    targetResourceTypes: [
      'Microsoft.Insights/components'
    ]
    criteria: {
      allOf: [
        {
          query: readinessFailuresQuery
          timeAggregation: 'Count'
          operator: 'GreaterThanOrEqual'
          threshold: 3
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        actionGroupResourceId
      ]
    }
    autoMitigate: true
    skipQueryValidation: false
  }
}

resource securityResponseSpike 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = if (enableAlerts) {
  name: 'recruitment-security-response-spike-v4'
  location: location
  properties: {
    displayName: 'Recruitment authentication or rate-limit spike'
    description: 'Alerts when recruitment endpoints produce twenty or more authentication, authorization or rate-limit responses within ten minutes. Query contains request metadata and result codes only.'
    enabled: true
    severity: 2
    evaluationFrequency: 'PT5M'
    windowSize: 'PT10M'
    scopes: [
      insights.id
    ]
    targetResourceTypes: [
      'Microsoft.Insights/components'
    ]
    criteria: {
      allOf: [
        {
          query: securityResponseSpikeQuery
          timeAggregation: 'Count'
          operator: 'GreaterThanOrEqual'
          threshold: 20
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        actionGroupResourceId
      ]
    }
    autoMitigate: true
    skipQueryValidation: false
  }
}

output alertRuleIds array = enableAlerts ? [
  criticalProcessingFailures.id
  repeatedApiFailures.id
  readinessUnavailable.id
  securityResponseSpike.id
] : []
