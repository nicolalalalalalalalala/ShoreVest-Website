#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./infra/recruitment/bootstrap-github-oidc.sh \
    --subscription-id <azure-subscription-guid> \
    --tenant-id <entra-tenant-guid> \
    [--oidc-subject <exact-github-oidc-subject>]

Creates the isolated ShoreVest recruitment test resource group, a user-assigned
managed identity for GitHub Actions, federated credentials for the repository's
standard and immutable OIDC subject formats, and resource-group-scoped Azure
roles. It does not deploy the recruitment backend or enable any application flow.
EOF
}

subscription_id=''
tenant_id=''
extra_oidc_subject=''
resource_group='rg-shorevest-recruitment-test-eastasia'
location='eastasia'
node_runtime_version='22'
identity_name='id-shorevest-recruitment-github-test'
issuer='https://token.actions.githubusercontent.com'
audience='api://AzureADTokenExchange'
legacy_subject='repo:shorevest/website:environment:recruitment-test'
immutable_subject='repo:shorevest@306632399/website@1277488295:environment:recruitment-test'

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
    --oidc-subject)
      extra_oidc_subject="${2:-}"
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

if [[ ! "$subscription_id" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  echo 'A valid --subscription-id GUID is required.' >&2
  exit 2
fi
if [[ ! "$tenant_id" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  echo 'A valid --tenant-id GUID is required.' >&2
  exit 2
fi

for command in az python3; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

az account set --subscription "$subscription_id"
actual_subscription="$(az account show --query id -o tsv)"
actual_tenant="$(az account show --query tenantId -o tsv)"

if [[ "${actual_subscription,,}" != "${subscription_id,,}" ]]; then
  echo 'Azure CLI resolved to the wrong subscription.' >&2
  exit 1
fi
if [[ "${actual_tenant,,}" != "${tenant_id,,}" ]]; then
  echo 'Azure CLI resolved to the wrong tenant.' >&2
  exit 1
fi

supported_locations="$(az functionapp list-flexconsumption-locations --query '[].name' -o tsv | tr '[:upper:]' '[:lower:]')"
if ! printf '%s\n' "$supported_locations" | grep -Eq '^(eastasia|east asia)$'; then
  echo 'Flex Consumption is not currently available in East Asia for this subscription.' >&2
  exit 1
fi

supported_node_versions="$(az functionapp list-flexconsumption-runtimes \
  --location "$location" \
  --runtime node \
  --query '[].version' \
  --output tsv)"
if ! printf '%s\n' "$supported_node_versions" | grep -qx "$node_runtime_version"; then
  echo "Node.js ${node_runtime_version} is not currently available for Flex Consumption in East Asia." >&2
  exit 1
fi

providers=(
  Microsoft.Authorization
  Microsoft.DocumentDB
  Microsoft.EventGrid
  Microsoft.Insights
  Microsoft.KeyVault
  Microsoft.ManagedIdentity
  Microsoft.OperationalInsights
  Microsoft.Security
  Microsoft.Storage
  Microsoft.Web
)

for provider in "${providers[@]}"; do
  state="$(az provider show --namespace "$provider" --query registrationState -o tsv 2>/dev/null || true)"
  if [[ "$state" != 'Registered' ]]; then
    echo "Registering Azure resource provider: $provider"
    az provider register --namespace "$provider" --wait --output none
  fi
done

az group create \
  --name "$resource_group" \
  --location "$location" \
  --tags workload=recruitment environment=test managedBy=github-actions \
  --output none

if az identity show --resource-group "$resource_group" --name "$identity_name" >/dev/null 2>&1; then
  identity_json="$(az identity show --resource-group "$resource_group" --name "$identity_name" --output json)"
else
  identity_json="$(az identity create \
    --resource-group "$resource_group" \
    --name "$identity_name" \
    --location "$location" \
    --tags workload=recruitment environment=test purpose=github-oidc \
    --output json)"
fi

client_id="$(printf '%s' "$identity_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["clientId"])')"
principal_id="$(printf '%s' "$identity_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["principalId"])')"
scope="/subscriptions/${subscription_id}/resourceGroups/${resource_group}"

ensure_federated_credential() {
  local name="$1"
  local subject="$2"
  local existing_subject

  if az identity federated-credential show \
    --resource-group "$resource_group" \
    --identity-name "$identity_name" \
    --name "$name" >/dev/null 2>&1; then
    existing_subject="$(az identity federated-credential show \
      --resource-group "$resource_group" \
      --identity-name "$identity_name" \
      --name "$name" \
      --query subject -o tsv)"
    if [[ "$existing_subject" != "$subject" ]]; then
      echo "Federated credential ${name} exists with an unexpected subject." >&2
      exit 1
    fi
    return
  fi

  az identity federated-credential create \
    --resource-group "$resource_group" \
    --identity-name "$identity_name" \
    --name "$name" \
    --issuer "$issuer" \
    --subject "$subject" \
    --audiences "$audience" \
    --output none
}

ensure_federated_credential 'github-recruitment-test-legacy' "$legacy_subject"
ensure_federated_credential 'github-recruitment-test-immutable' "$immutable_subject"

if [[ -n "$extra_oidc_subject" ]]; then
  ensure_federated_credential 'github-recruitment-test-explicit' "$extra_oidc_subject"
fi

ensure_role_assignment() {
  local role="$1"
  local assignment_count

  assignment_count="$(az role assignment list \
    --assignee-object-id "$principal_id" \
    --scope "$scope" \
    --role "$role" \
    --fill-principal-name false \
    --query 'length(@)' \
    --output tsv)"

  if [[ "$assignment_count" == '0' ]]; then
    az role assignment create \
      --assignee-object-id "$principal_id" \
      --assignee-principal-type ServicePrincipal \
      --role "$role" \
      --scope "$scope" \
      --output none
  fi
}

ensure_role_assignment 'Contributor'
ensure_role_assignment 'Role Based Access Control Administrator'

cat <<EOF

Azure OIDC bootstrap complete.

Create a protected GitHub environment named: recruitment-test
Add these environment variables:

AZURE_CLIENT_ID=${client_id}
AZURE_TENANT_ID=${tenant_id}
AZURE_SUBSCRIPTION_ID=${subscription_id}

Resource group: ${resource_group}
Identity: ${identity_name}
Scope: ${scope}

No recruitment backend was deployed and no public application control was enabled.
EOF
