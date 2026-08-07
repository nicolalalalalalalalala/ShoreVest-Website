targetScope = 'resourceGroup'

@description('Existing recruitment Function App name.')
param functionAppName string

@description('Existing recruitment user-assigned managed identity name.')
param managedIdentityName string

@description('Existing Functions host/deployment storage account name.')
param hostStorageAccountName string

@description('Existing recruitment Cosmos DB account name.')
param cosmosAccountName string

@description('Existing recruitment CV storage account name.')
param cvStorageAccountName string

@description('Existing recruitment Key Vault name.')
param keyVaultName string

@description('Existing recruitment Application Insights component name.')
param applicationInsightsName string

@description('Runtime environment: dev, test or prod.')
param environmentName string

@description('Enable public recruitment API only after complete launch approval.')
param enableApi bool = false

@description('Allow the public API to capture applications while all external delivery, HR access and retention actions remain disabled.')
param enableCaptureOnlyMode bool = false

@description('Enable SharePoint and Graph outbox delivery only after resource grants are verified.')
param enableOutboxDelivery bool = false

@description('Enable candidate acknowledgement only after mailbox restriction and copy approval.')
param enableCandidateAcknowledgement bool = false

@description('Confirm candidate acknowledgement copy is approved.')
param candidateAcknowledgementTemplateApproved bool = false

@description('Enable HR clean-document access only after Easy Auth deployment and role assignment.')
param enableHrAccess bool = false

@description('Confirm Easy Auth platform authentication is deployed.')
param platformAuthenticationEnabled bool = false

@description('Enable retention policy assignment only after HR and Legal approval.')
param enableRetention bool = false

@description('Enable destructive retention only after recovery testing and explicit approval.')
param enableRetentionDeletion bool = false

@description('Approved SharePoint site ID. Blank while delivery is disabled.')
param sharePointSiteId string = ''

@description('Approved RecruitmentApplications list ID. Blank while delivery is disabled.')
param applicationsListId string = ''

@description('Approved RecruitmentFiles list ID. Blank while delivery is disabled.')
param filesListId string = ''

@description('Approved recruitment mailbox. Blank while acknowledgement is disabled.')
param candidateAcknowledgementMailbox string = ''

@description('Approved privacy notice URL included in acknowledgement messages.')
param candidateAcknowledgementPrivacyUrl string = 'https://shorevest.com/privacy-policy/'

@description('Approved retention policy version. Blank while retention is disabled.')
param retentionPolicyVersion string = ''

@minValue(1)
param retentionIncompleteHours int = 48

@minValue(1)
param retentionSubmittedDays int = 365

@minValue(1)
param retentionMaliciousDays int = 30

@minValue(1)
param retentionBatchSize int = 10

@minValue(60)
param retentionLeaseSeconds int = 300

@minValue(60)
param retentionRetrySeconds int = 900

@minValue(1)
param rateLimitCount int = 5

@minValue(60)
param rateLimitWindowSeconds int = 300

@minValue(1024)
param maxBodyBytes int = 65536

@description('Comma-separated Turnstile token hostnames. This set must exactly match the public-origin hostnames.')
param botVerificationHostnames string = 'shorevest.com,www.shorevest.com'

@description('Expected Turnstile widget action for candidate application submission.')
param botVerificationAction string = 'recruitment-application'

@description('Key Vault secret name for completion/finalization token signing.')
param completionTokenSecretName string = 'recruitment-completion-token-key'

@description('Key Vault secret name for request fingerprints and rate-limit keys.')
param fingerprintSecretName string = 'recruitment-fingerprint-key'

@description('Key Vault secret name for Cloudflare Turnstile.')
param botVerificationSecretName string = 'recruitment-turnstile-secret'

resource fn 'Microsoft.Web/sites@2024-04-01' existing = {
  name: functionAppName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: managedIdentityName
}

resource hostStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: hostStorageAccountName
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: cosmosAccountName
}

resource cvStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: cvStorageAccountName
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource insights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
}

var runtimeEnvironment = environmentName == 'prod' ? 'production' : environmentName

resource appSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: fn
  name: 'appsettings'
  properties: {
    FUNCTIONS_REQUEST_BODY_SIZE_LIMIT: string(maxBodyBytes)
    AzureWebJobsStorage__accountName: hostStorage.name
    AzureWebJobsStorage__credential: 'managedidentity'
    AzureWebJobsStorage__clientId: identity.properties.clientId
    AZURE_CLIENT_ID: identity.properties.clientId
    APPLICATIONINSIGHTS_CONNECTION_STRING: insights.properties.ConnectionString

    RECRUITMENT_MANAGED_IDENTITY_CLIENT_ID: identity.properties.clientId
    RECRUITMENT_API_ENABLED: string(enableApi)
    RECRUITMENT_CAPTURE_ONLY_MODE: string(enableCaptureOnlyMode)
    RECRUITMENT_ENVIRONMENT: runtimeEnvironment
    RECRUITMENT_ALLOWED_ORIGINS: 'https://shorevest.com,https://www.shorevest.com'
    RECRUITMENT_REQUIRE_ORIGIN: 'true'
    RECRUITMENT_MAX_BODY_BYTES: string(maxBodyBytes)

    RECRUITMENT_COSMOS_ENDPOINT: cosmos.properties.documentEndpoint
    RECRUITMENT_COSMOS_DATABASE: 'recruitment'
    RECRUITMENT_STORAGE_ACCOUNT_URL: cvStorage.properties.primaryEndpoints.blob
    RECRUITMENT_UPLOAD_STORAGE_ACCOUNT_NAME: cvStorage.name
    RECRUITMENT_QUARANTINE_CONTAINER: 'recruitment-quarantine'
    RECRUITMENT_CLEAN_CONTAINER: 'recruitment-clean'

    RECRUITMENT_KEYVAULT_URL: vault.properties.vaultUri
    RECRUITMENT_COMPLETION_TOKEN_SECRET_NAME: completionTokenSecretName
    RECRUITMENT_FINGERPRINT_SECRET_NAME: fingerprintSecretName

    RECRUITMENT_RATE_LIMIT_ENABLED: 'true'
    RECRUITMENT_RATE_LIMIT_COUNT: string(rateLimitCount)
    RECRUITMENT_RATE_LIMIT_WINDOW_SECONDS: string(rateLimitWindowSeconds)

    RECRUITMENT_BOT_VERIFICATION_MODE: 'turnstile'
    RECRUITMENT_BOT_VERIFICATION_SECRET_NAME: botVerificationSecretName
    RECRUITMENT_BOT_VERIFICATION_HOSTNAME: botVerificationHostnames
    RECRUITMENT_BOT_VERIFICATION_ACTION: botVerificationAction
    RECRUITMENT_BOT_VERIFICATION_ENDPOINT: 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

    RECRUITMENT_OUTBOX_DELIVERY_ENABLED: string(enableOutboxDelivery)
    RECRUITMENT_OUTBOX_LEASE_SECONDS: '300'
    RECRUITMENT_OUTBOX_RETRY_SECONDS: '900'
    RECRUITMENT_OUTBOX_MAX_ATTEMPTS: '10'

    RECRUITMENT_GRAPH_ENDPOINT: 'https://graph.microsoft.com/v1.0'
    RECRUITMENT_SHAREPOINT_SITE_ID: sharePointSiteId
    RECRUITMENT_APPLICATIONS_LIST_ID: applicationsListId
    RECRUITMENT_FILES_LIST_ID: filesListId

    RECRUITMENT_CANDIDATE_ACK_ENABLED: string(enableCandidateAcknowledgement)
    RECRUITMENT_CANDIDATE_ACK_TEMPLATE_APPROVED: string(candidateAcknowledgementTemplateApproved)
    RECRUITMENT_CANDIDATE_ACK_MAILBOX: candidateAcknowledgementMailbox
    RECRUITMENT_CANDIDATE_ACK_PRIVACY_URL: candidateAcknowledgementPrivacyUrl

    RECRUITMENT_PLATFORM_AUTH_ENABLED: string(platformAuthenticationEnabled)
    RECRUITMENT_HR_ACCESS_ENABLED: string(enableHrAccess)
    RECRUITMENT_HR_REQUIRED_ROLE: 'Recruitment.HR'
    RECRUITMENT_HR_READ_SAS_SECONDS: '300'

    RECRUITMENT_RETENTION_ENABLED: string(enableRetention)
    RECRUITMENT_RETENTION_DELETION_ENABLED: string(enableRetentionDeletion)
    RECRUITMENT_RETENTION_POLICY_VERSION: retentionPolicyVersion
    RECRUITMENT_RETENTION_ADMIN_ROLE: 'Recruitment.RetentionAdmin'
    RECRUITMENT_RETENTION_INCOMPLETE_HOURS: string(retentionIncompleteHours)
    RECRUITMENT_RETENTION_SUBMITTED_DAYS: string(retentionSubmittedDays)
    RECRUITMENT_RETENTION_MALICIOUS_DAYS: string(retentionMaliciousDays)
    RECRUITMENT_RETENTION_BATCH_SIZE: string(retentionBatchSize)
    RECRUITMENT_RETENTION_LEASE_SECONDS: string(retentionLeaseSeconds)
    RECRUITMENT_RETENTION_RETRY_SECONDS: string(retentionRetrySeconds)
  }
}

output functionAppId string = fn.id
output managedIdentityClientId string = identity.properties.clientId
output publicApiEnabled bool = enableApi
output captureOnlyMode bool = enableCaptureOnlyMode
output outboxDeliveryEnabled bool = enableOutboxDelivery
output candidateAcknowledgementEnabled bool = enableCandidateAcknowledgement
output hrAccessEnabled bool = enableHrAccess
output retentionEnabled bool = enableRetention
output retentionDeletionEnabled bool = enableRetentionDeletion
