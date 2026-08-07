# Recruitment Function deployment contract

The recruitment backend is not deployed by merging source code. Deployment is a separate, approved operation.

## Safety boundary

All deployment and launch controls default off:

- `RECRUITMENT_API_ENABLED=false`
- `RECRUITMENT_OUTBOX_DELIVERY_ENABLED=false`
- `RECRUITMENT_CANDIDATE_ACK_ENABLED=false`
- `RECRUITMENT_HR_ACCESS_ENABLED=false`
- `RECRUITMENT_RETENTION_ENABLED=false`
- `RECRUITMENT_RETENTION_DELETION_ENABLED=false`
- Microsoft Defender for Storage disabled unless explicitly enabled
- Azure Monitor alert rules disabled unless explicitly enabled

Deploying the Function package does not make recruitment applications public.

## Artifact contract

Create the deployment artifact only through:

```powershell
pwsh -NoProfile -File services/recruitment-functions/scripts/package.ps1 \
  -CommitSha <full-commit-sha> \
  -OutputPath artifacts/recruitment-functions.zip
```

The script:

1. installs production dependencies with `npm ci --omit=dev`;
2. creates a temporary staging directory;
3. copies only the Function runtime, bundled domain core, manifest contract and production dependencies;
4. writes `deployment-metadata.json` with the source commit, package time, a deterministic staged-payload SHA-256 and the expected archive-digest sidecar name;
5. runs syntax checks against the staged files;
6. creates the ZIP from the staging root and writes the final ZIP SHA-256 to an adjacent `.sha256` sidecar;
7. rejects forbidden local settings, environment files, keys, certificates and archives.

The ZIP root must contain:

- `host.json`
- `package.json`
- `src/`
- `node_modules/`
- `api/recruitment/core/`
- `assets/data/recruitment/`
- `deployment-metadata.json`

The ZIP must not contain a wrapper folder such as `staging/` or `recruitment-functions/`.

## Required approvals before deployment

- approved Azure resource names and region;
- approved retention, privacy, consent and malicious-file policies;
- three populated Key Vault secrets;
- approved Turnstile configuration;
- approved Defender cost decision;
- approved SharePoint list IDs and selected-resource grants;
- approved recruitment mailbox and Exchange application-access restriction;
- approved Easy Auth app registration and app-role assignments;
- named operational and security owners.

## Deployment order

### 1. Deploy the Azure foundation

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/recruitment/main.bicep \
  --parameters environmentName=<environment> namePrefix=<prefix>
```

This creates the Function App, managed identity, Cosmos DB, private Blob containers, Key Vault, workspace-based Application Insights, monitoring resources and least-privilege Azure RBAC. It leaves the public API and external delivery disabled.

### 2. Apply candidate-upload Blob CORS

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/recruitment/candidate-upload-cors.bicep \
  --parameters storageAccountName=<recruitment-cv-storage-account>
```

This is required for direct candidate browser uploads. The policy allows only:

- origins `https://shorevest.com` and `https://www.shorevest.com`;
- methods `PUT` and `OPTIONS`;
- upload headers required by Azure Blob Storage.

It does not allow browser `GET`, listing, deletion or wildcard origins. Do not test the public upload flow until this step is complete.

### 3. Apply the complete runtime settings v2 contract

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/recruitment/runtime-settings.v2.bicep \
  --parameters \
    functionAppName=<function-app> \
    managedIdentityName=<managed-identity> \
    hostStorageAccountName=<host-storage> \
    cosmosAccountName=<cosmos-account> \
    cvStorageAccountName=<cv-storage> \
    keyVaultName=<key-vault> \
    applicationInsightsName=<application-insights> \
    environmentName=<environment>
```

Keep every enablement parameter at its default `false` during initial deployment. Reapply the same template after each approved capability change so the full settings set remains authoritative and identity-based Functions host settings are preserved.

### 4. Build and upload an immutable Function package

```bash
az storage blob upload \
  --auth-mode login \
  --account-name <host-storage-account> \
  --container-name recruitment-functions \
  --name packages/recruitment-functions-<commit-sha>.zip \
  --file artifacts/recruitment-functions.zip \
  --overwrite false
```

Use an immutable commit-addressed Blob name. Do not overwrite deployment artifacts. Retain `deployment-metadata.json`, the staged-payload digest and the final archive `.sha256` sidecar with the change record.

Update the Flex Consumption deployment storage package reference through the approved Azure deployment command for the environment. Do not use storage account keys or connection strings.

### 5. Deploy Easy Auth after the Entra application exists

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/recruitment/hr-auth.bicep \
  --parameters \
    functionAppName=<function-app> \
    entraClientId=<application-client-id> \
    openIdIssuer=<tenant-specific-openid-issuer>
```

Assign `Recruitment.HR` only to approved HR reviewers and `Recruitment.RetentionAdmin` only to approved Legal/retention administrators.

### 6. Provision and grant Microsoft 365 resources

- create exactly `RecruitmentApplications` and `RecruitmentFiles` using `sharepoint-lists.v1.json`;
- grant the Function identity selected write access to only those two lists;
- restrict `Mail.ReadWrite` and `Mail.Send` to the approved recruitment mailbox;
- configure the two event-specific Power Automate notification state machines;
- verify the identity cannot access unrelated sites, lists or mailboxes.

### 7. Enable and verify non-public delivery capabilities

Reapply `runtime-settings.v2.bicep` with only the approved delivery controls enabled:

- `enableOutboxDelivery=true` after SharePoint grants are verified;
- `enableCandidateAcknowledgement=true` only with `candidateAcknowledgementTemplateApproved=true` and the mailbox restriction verified.

Keep `enableApi`, `enableRetention`, `enableRetentionDeletion` and `enableHrAccess` false during this stage. Verify SharePoint upserts, notification state isolation, Graph retry/reconciliation and candidate acknowledgement recovery before proceeding.

### 8. Enable retention policy assignment, then HR access

After delivery is healthy and the retention policy is approved, reapply `runtime-settings.v2.bicep` with `enableRetention=true`. Keep `enableRetentionDeletion=false` until destructive recovery tests pass and explicit approval is recorded.

After Easy Auth and app-role boundaries are verified, enable `enableHrAccess=true` with `platformAuthenticationEnabled=true`. Confirm an approved HR user can obtain a five-minute read-only link only for a clean, fully verified CV, and that an unassigned user is denied.

### 9. Enable Defender in non-production only

Redeploy `main.bicep` with `enableDefenderForStorage=true` only after the cost decision is approved.

Then deploy the scan-result Event Grid subscription:

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/recruitment/event-grid-subscription.bicep \
  --parameters \
    topicName=<scan-topic> \
    functionAppName=<function-app>
```

The subscription filters only `Microsoft.Security.MalwareScanningResult`. Retryable processing failures are thrown back to Event Grid, which applies the configured redelivery policy. Long-running private clean-Blob copies return `Pending` and resume on redelivery rather than starting duplicate copies.

### 10. Deploy monitoring v4

The Application Insights resource must be workspace-based. The authoritative alert template queries `AppTraces` and `AppRequests` directly and does not use unsupported `search` or `union` query patterns.

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/recruitment/monitoring-rules.v4.bicep \
  --parameters \
    applicationInsightsName=<application-insights> \
    actionGroupResourceId=<action-group-resource-id> \
    enableAlerts=true
```

Run each query in non-production, generate controlled test events and verify alert delivery to the named operational and security owners. Confirm alert payloads contain no candidate PII or document identifiers.

### 11. Execute non-production end-to-end tests

Required cases include:

- successful PDF and DOCX submissions;
- rejected malformed, oversized, encrypted and mismatched files;
- duplicate initiate, complete, finalize and Event Grid delivery;
- initiation retry while the first upload credential is still active;
- clean scan completing before and after finalization;
- pending clean copy across multiple Event Grid deliveries;
- malicious, unsupported, timeout and scan-error outcomes;
- Graph throttling and mailbox reconciliation;
- SharePoint duplicate-key handling;
- legal hold before, during and after an expired purge lease;
- partial Blob deletion followed by Cosmos failure and lease recovery;
- retention purge and idempotency-cleanup retry;
- dependency outage and recovery;
- expired upload, completion, finalization and HR read credentials.

### 12. Enable destructive retention and the public API last

Enable destructive retention only after legal-hold, partial-deletion and purge-projection recovery tests pass and the approval is recorded. Reapply `runtime-settings.v2.bicep` with `enableRetentionDeletion=true` while the public API remains off, then verify one controlled eligible record through the complete purge and SharePoint projection path.

Enable `enableApi=true` only after every prerequisite above is healthy, the public application form is integrated, privacy copy is approved and final production launch approval is recorded.

The Careers role-publication switches and frontend application form remain separate final release steps.

## Rollback

Rollback in this order:

1. reapply `runtime-settings.v2.bicep` with `enableApi=false`;
2. disable external delivery, HR access and retention deletion as required;
3. disable the Event Grid subscription if scan processing is unsafe;
4. redeploy monitoring v4 with `enableAlerts=false` if alerts are misconfigured;
5. revert to the last approved immutable Function package;
6. preserve Cosmos, Blob, SharePoint and monitoring records for investigation;
7. do not delete candidate data as part of an application rollback.

## Evidence to retain

- approved deployment parameters;
- source commit and PR;
- `deployment-metadata.json`, staged-payload SHA-256 and final archive `.sha256` sidecar;
- Bicep deployment results;
- CORS verification result;
- Key Vault secret version identifiers, not secret values;
- Entra role assignments;
- SharePoint and mailbox permission evidence;
- test results and failure-injection evidence;
- alert delivery evidence;
- final enablement approval.
