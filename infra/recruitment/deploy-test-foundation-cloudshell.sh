#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./infra/recruitment/deploy-test-foundation-cloudshell.sh \
    --subscription-id <azure-subscription-guid> \
    --tenant-id <entra-tenant-guid> \
    --confirm DEPLOY_TEST_FOUNDATION

Performs the first disabled ShoreVest recruitment test-foundation deployment.
It creates no SharePoint resources, sends no email, enables no candidate API,
enables no HR access, enables no retention/deletion and leaves Defender off.
EOF
}

subscription_id=''
tenant_id=''
confirmation=''
resource_group='rg-shorevest-recruitment-test-eastasia'
location='eastasia'
environment_name='test'
name_prefix='svrc26hk'
parameters_file='infra/recruitment/test-eastasia.bicepparam'
evidence_directory='artifacts/recruitment-test-foundation'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --subscription-id)
      subscription_id="${2:-}"
      shift 2
      ;;
    --tenant-id)
      tenant_id="${2:-}"
      shift 2
      ;;
    --confirm)
      confirmation="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$confirmation" != 'DEPLOY_TEST_FOUNDATION' ]]; then
  echo 'Explicit --confirm DEPLOY_TEST_FOUNDATION is required.' >&2
  exit 2
fi
if [[ ! "$subscription_id" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  echo 'A valid --subscription-id GUID is required.' >&2
  exit 2
fi
if [[ ! "$tenant_id" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  echo 'A valid --tenant-id GUID is required.' >&2
  exit 2
fi
if [[ ! -f "$parameters_file" ]]; then
  echo "Run this command from the repository root. Missing: ${parameters_file}" >&2
  exit 1
fi

for command in az bash; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

bash infra/recruitment/bootstrap-github-oidc.sh \
  --subscription-id "$subscription_id" \
  --tenant-id "$tenant_id"

az account set --subscription "$subscription_id"
actual_tenant="$(az account show --query tenantId -o tsv)"
if [[ "${actual_tenant,,}" != "${tenant_id,,}" ]]; then
  echo 'Azure CLI resolved to the wrong tenant.' >&2
  exit 1
fi

az bicep install >/dev/null
az bicep build-params --file "$parameters_file" --stdout >/dev/null
mkdir -p "$evidence_directory"
run_stamp="$(date -u +%Y%m%dT%H%M%SZ)"

az deployment group validate \
  --resource-group "$resource_group" \
  --parameters "$parameters_file" \
  --output none

az deployment group what-if \
  --resource-group "$resource_group" \
  --parameters "$parameters_file" \
  --no-pretty-print \
  --output json > "${evidence_directory}/what-if-${run_stamp}.json"

az deployment group create \
  --name "recruitment-test-foundation-${run_stamp}" \
  --resource-group "$resource_group" \
  --parameters "$parameters_file" \
  --output json > "${evidence_directory}/deployment-${run_stamp}.json"

cv_storage_name="${name_prefix}cv${environment_name}"
function_app_name="${name_prefix}-recruit-fn-${environment_name}"
managed_identity_name="${name_prefix}-recruit-mi-${environment_name}"
host_storage_name="${name_prefix}fnpkg${environment_name}"
cosmos_name="${name_prefix}-recruit-cosmos-${environment_name}"
key_vault_name="${name_prefix}-recruit-kv-${environment_name}"
insights_name="${name_prefix}-recruit-ai-${environment_name}"

az deployment group create \
  --name "recruitment-test-cors-${run_stamp}" \
  --resource-group "$resource_group" \
  --template-file infra/recruitment/candidate-upload-cors.bicep \
  --parameters storageAccountName="$cv_storage_name" \
  --output none

az deployment group create \
  --name "recruitment-test-settings-${run_stamp}" \
  --resource-group "$resource_group" \
  --template-file infra/recruitment/runtime-settings.v2.bicep \
  --parameters \
    functionAppName="$function_app_name" \
    managedIdentityName="$managed_identity_name" \
    hostStorageAccountName="$host_storage_name" \
    cosmosAccountName="$cosmos_name" \
    cvStorageAccountName="$cv_storage_name" \
    keyVaultName="$key_vault_name" \
    applicationInsightsName="$insights_name" \
    environmentName="$environment_name" \
    enableApi=false \
    enableOutboxDelivery=false \
    enableCandidateAcknowledgement=false \
    candidateAcknowledgementTemplateApproved=false \
    enableHrAccess=false \
    platformAuthenticationEnabled=false \
    enableRetention=false \
    enableRetentionDeletion=false \
  --output none

settings=(
  RECRUITMENT_API_ENABLED
  RECRUITMENT_OUTBOX_DELIVERY_ENABLED
  RECRUITMENT_CANDIDATE_ACK_ENABLED
  RECRUITMENT_HR_ACCESS_ENABLED
  RECRUITMENT_RETENTION_ENABLED
  RECRUITMENT_RETENTION_DELETION_ENABLED
)

for key in "${settings[@]}"; do
  value="$(az functionapp config appsettings list \
    --resource-group "$resource_group" \
    --name "$function_app_name" \
    --query "[?name=='${key}'].value | [0]" \
    --output tsv)"
  if [[ "${value,,}" != 'false' ]]; then
    echo "Safety verification failed: ${key}=${value}" >&2
    exit 1
  fi
done

cosmos_capabilities="$(az cosmosdb show \
  --resource-group "$resource_group" \
  --name "$cosmos_name" \
  --query 'capabilities[].name' \
  --output tsv)"
if ! printf '%s\n' "$cosmos_capabilities" | grep -qx 'EnableServerless'; then
  echo 'Safety verification failed: test Cosmos DB is not explicitly serverless.' >&2
  exit 1
fi

defender_count="$(az resource list \
  --resource-group "$resource_group" \
  --resource-type Microsoft.Security/defenderForStorageSettings \
  --query 'length(@)' \
  --output tsv)"
if [[ "$defender_count" != '0' ]]; then
  echo 'Safety verification failed: Defender for Storage is enabled.' >&2
  exit 1
fi

az resource list \
  --resource-group "$resource_group" \
  --query '[].{name:name,type:type,location:location}' \
  --output json > "${evidence_directory}/resources-${run_stamp}.json"

cat <<EOF

Disabled recruitment test foundation deployed successfully.

Resource group: ${resource_group}
Region: ${location}
Function App: ${function_app_name}
Cosmos DB: serverless
Evidence: ${evidence_directory}

Confirmed disabled:
- public recruitment API
- SharePoint and email delivery
- candidate acknowledgement
- HR document access
- retention and destructive deletion
- Defender for Storage
- public Careers application form remains unchanged

The Function package, Key Vault secret values, Entra HR roles, SharePoint lists,
mail delivery, Defender/Event Grid and public frontend were not deployed or enabled.
EOF
