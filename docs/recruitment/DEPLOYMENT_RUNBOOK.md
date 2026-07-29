# Recruitment backend deployment runbook

This runbook separates backend deployment from the public Careers launch. Completing it does not publish roles or expose an application form.

`docs/recruitment/DEPLOYMENT_CONTRACT.md` is authoritative.

## Initial state

The first deployment must keep every capability disabled:

- public recruitment API;
- SharePoint and email delivery;
- candidate acknowledgement;
- HR document access;
- retention policy assignment;
- destructive retention;
- Defender for Storage;
- Azure Monitor alerts;
- `careersOpenRolesEnabled`;
- every role-level `application.enabled` flag.

Do not change public website flags until non-production acceptance is complete.

## ShoreVest test foundation

The checked-in test target is intentionally isolated from ShoreVest One production:

- resource group: `rg-shorevest-recruitment-test-eastasia`;
- region: `eastasia`;
- environment: `test`;
- parameters: `infra/recruitment/test-eastasia.bicepparam`;
- Cosmos DB capacity: serverless;
- Defender for Storage: disabled;
- Function maximum instance count: two.

The first deployment must run from an authenticated Azure Cloud Shell using `infra/recruitment/deploy-test-foundation-cloudshell.sh`. That script validates the Azure tenant and subscription context, checks Flex Consumption availability, records a what-if result, deploys the disabled foundation and verifies every launch and destructive switch remains false.

It also bootstraps a resource-group-scoped GitHub OIDC identity for later repeatable deployments. Once the protected `recruitment-test` GitHub environment has the emitted `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` variables, subsequent foundation deployments may use `.github/workflows/recruitment-test-foundation-deploy.yml` with the exact confirmation text `DEPLOY_TEST_FOUNDATION`.

Do not commit subscription IDs, tenant IDs, client IDs, credentials, secret values or deployment output.

## Deployment sequence

### 1. Azure foundation

Deploy `infra/recruitment/main.bicep` with Defender disabled. Confirm the Function App, managed identity, host storage, private CV storage, Cosmos DB, Key Vault and workspace-based Application Insights resources exist.

### 2. Candidate-upload CORS

Deploy `infra/recruitment/candidate-upload-cors.bicep`. Confirm only approved ShoreVest origins can use the required upload methods and headers.

### 3. Key Vault

Populate the approved token-signing, fingerprint and bot-verification secrets through the controlled administrative process. Do not place secret values in source control, parameters, deployment output or logs.

### 4. Runtime settings v2

Deploy `infra/recruitment/runtime-settings.v2.bicep` with every enablement parameter false. Reapply the complete template after each approved settings change rather than editing the portal manually.

### 5. Function package

Build the immutable package through the repository packaging script, upload it under the full source commit SHA and deploy that package reference. Confirm the expected public, scan, outbox, HR, retention and health Functions are indexed. The public API must remain unavailable.

### 6. Entra and Easy Auth

Create the approved Entra application and separate `Recruitment.HR` and `Recruitment.RetentionAdmin` roles, then deploy `infra/recruitment/hr-auth.bicep`.

Verify anonymous candidate access remains possible, protected endpoints reject anonymous users, users without the exact role are denied and the two privileged roles do not grant each other.

### 7. Microsoft 365 resources

Create exactly `RecruitmentApplications` and `RecruitmentFiles` from `infra/recruitment/sharepoint-lists.v1.json`. Grant selected access to those lists only and restrict Graph mail permissions to the approved recruitment mailbox.

Keep delivery disabled until the permission tests pass.

### 8. Non-public delivery

Reapply runtime settings v2 with SharePoint IDs and the restricted mailbox. Enable outbox delivery first. Enable candidate acknowledgement only after the copy is approved.

Verify deterministic SharePoint updates, separate notification states, retry and reconciliation behavior, and that CV bytes are never copied into SharePoint or email.

### 9. Retention policy and HR access

After delivery is healthy and policy approval is recorded, enable retention policy assignment while destructive deletion remains disabled.

After Easy Auth role tests pass, enable HR document access with platform authentication enabled. Confirm approved HR users receive only short-lived read access to a verified clean CV and unassigned users are denied.

### 10. Defender and Event Grid

Deploy `infra/recruitment/event-grid-subscription.bicep`, then enable Defender in non-production. Verify clean, malicious, failed and delayed scan outcomes, including scans completing before application finalization.

### 11. Monitoring v4

Confirm Application Insights is workspace-based. Deploy `infra/recruitment/monitoring-rules.v4.bicep` with `enableAlerts=true` explicitly.

Run each query in non-production, generate controlled events and verify the action group. Confirm monitoring contains no candidate or document identifiers.

### 12. Acceptance and recovery tests

Test successful and rejected files, duplicate and retry behavior, active-upload initiation retries, scoped rate limits, provider failures, scan ordering, SharePoint and email reconciliation, role boundaries, legal holds, partial purge recovery, cleanup retry and disabled-API behavior.

### 13. Destructive retention

Enable destructive retention only after recovery testing and explicit approval. Keep the public API disabled and process one controlled eligible record through the full purge and external projection path.

### 14. Non-production API

Enable the non-production public API only after the complete backend acceptance suite passes. Test it directly without exposing the Careers application form.

### 15. Production

Repeat the approved deployment and acceptance sequence in production with the API disabled. Production enablement requires recorded HR, Legal, IT/Security and operational-owner approval.

## Public launch

A separate frontend change may proceed only after the production backend is proven. It must:

1. add the application form;
2. connect it to the deployed API;
3. enable approved role applications;
4. enable `careersOpenRolesEnabled`;
5. restore approved role pages to indexing and the sitemap.

Do not combine backend rollout and public launch in one release.
