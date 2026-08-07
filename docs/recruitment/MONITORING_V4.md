# Recruitment monitoring v4

`infra/recruitment/monitoring-rules.v4.bicep` is the authoritative recruitment alert template.

The recruitment deployment contract requires workspace-based Application Insights. The alert rules therefore query the workspace tables directly:

- `AppTraces` for stable runtime event names;
- `AppRequests` for endpoint result codes.

Do not deploy or retain superseded monitoring templates or workflows after review.

## Why v4 is authoritative

V4 addresses the material alert-query defects identified during review:

1. Log search alert queries begin with a single table. They do not use `search` or `union`.
2. The template targets workspace-based Application Insights and uses `TimeGenerated`, `Message`, `Name`, `Url` and `ResultCode` from the `AppTraces` and `AppRequests` schemas.
3. Scheduled-query `Count` aggregation counts rows returned by the KQL query. V4 returns one raw row per matching telemetry record and does not pre-summarize failures.

## Alert rules

### Critical processing failures

Severity 1. Fires on any matching event within five minutes:

- `recruitment_configuration_invalid`
- `recruitment_outbox_configuration_invalid`
- `recruitment_scan_event_rejected`
- `recruitment_scan_event_retry_requested`
- `recruitment_retention_configuration_invalid`
- `recruitment_retention_purge_failed`
- `recruitment_retention_idempotency_cleanup_failed`
- `finalization_outcome_reconciliation_failed`
- `initiate_abuse_controls_missing`

### Repeated recruitment API failures

Severity 2. Fires when at least five recruitment endpoint requests return HTTP 5xx within five minutes.

### Readiness unavailable

Severity 2. Fires when the recruitment readiness endpoint returns HTTP 5xx at least three times within ten minutes.

### Authentication or rate-limit spike

Severity 2. Fires when recruitment endpoints return at least twenty HTTP 401, 403 or 429 responses within ten minutes.

## Privacy boundary

The queries use only:

- stable event names;
- request names and URLs;
- HTTP result codes;
- timestamps;
- aggregate counts.

They must not include candidate names, email addresses, telephone numbers, application references, file references, filenames, document hashes or Blob paths.

## Deployment

Alerts are explicit opt-in. `enableAlerts` defaults to `false`.

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/recruitment/monitoring-rules.v4.bicep \
  --parameters \
    applicationInsightsName=<application-insights> \
    actionGroupResourceId=<action-group-resource-id> \
    enableAlerts=true
```

Before enabling production alerts:

1. Confirm the Application Insights resource is workspace-based.
2. Compile and lint the template through the `Recruitment Monitoring V4` workflow.
3. Run each KQL query against the non-production Application Insights resource.
4. Generate one controlled event for each rule.
5. Confirm the action group delivers to the named operational and security owners.
6. Confirm alert payloads contain no candidate PII or document identifiers.
7. Record the test evidence in the deployment change record.

## Rollback

Redeploy with `enableAlerts=false` or disable the four v4 scheduled-query rules. Do not remove Application Insights or the Log Analytics workspace as part of alert rollback.
