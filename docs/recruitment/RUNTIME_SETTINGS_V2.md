# Recruitment runtime settings v2

`infra/recruitment/runtime-settings.v2.bicep` is the authoritative Function App settings template for the recruitment backend.

The earlier `runtime-settings.bicep` must not be treated as production-authoritative until it is removed or reconciled before merge.

## Why a complete template is required

`Microsoft.Web/sites/config` app-settings deployment replaces the Function App settings collection. A partial recruitment settings template can therefore remove identity-based Functions host configuration and make the app fail after an otherwise successful deployment.

Runtime settings v2 repeats both categories in one deployment:

### Functions host settings

- `FUNCTIONS_EXTENSION_VERSION`
- `FUNCTIONS_WORKER_RUNTIME`
- `AzureWebJobsStorage__accountName`
- `AzureWebJobsStorage__credential=managedidentity`
- `AzureWebJobsStorage__clientId`
- `AZURE_CLIENT_ID`
- `APPLICATIONINSIGHTS_CONNECTION_STRING`

### Recruitment application settings

- managed identity, Cosmos, Blob and Key Vault resource settings;
- strict origins and request-size limit;
- Turnstile and fixed-window rate limiting;
- outbox, Graph and SharePoint identifiers;
- candidate acknowledgement controls;
- Easy Auth confirmation and HR role;
- retention, legal-hold and destructive-deletion controls.

## Safety defaults

These parameters default to `false`:

- `enableApi`
- `enableOutboxDelivery`
- `enableCandidateAcknowledgement`
- `candidateAcknowledgementTemplateApproved`
- `enableHrAccess`
- `platformAuthenticationEnabled`
- `enableRetention`
- `enableRetentionDeletion`

The template contains secret names only. Secret values remain in Key Vault.

## Deployment

Deploy only after the Azure foundation exists:

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

Keep all enablement parameters at their defaults for the first deployment.

## Verification

After deployment, verify:

1. The Function host starts without a storage connection string.
2. `AzureWebJobsStorage` uses the user-assigned identity client ID.
3. No storage account key or client secret appears in settings.
4. The health endpoint reports configuration validity without exposing resource identifiers.
5. Public submission remains unavailable while `enableApi=false`.
6. HR, Graph and retention capabilities remain unavailable while their flags are false.
7. Reapplying runtime settings v2 produces no destructive settings drift.

The dedicated `Recruitment Runtime Settings V2` workflow compiles the template and checks that all host and recruitment settings remain present.
