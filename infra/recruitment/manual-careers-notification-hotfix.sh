#!/usr/bin/env bash
set -euo pipefail

SUBSCRIPTION_ID='4146f1fc-590f-4ee4-a7b7-57f15c08c74e'
TENANT_ID='768bd74c-6be4-4c55-b52d-33673e3b8700'
RESOURCE_GROUP='rg-shorevest-recruitment-test-eastasia'
FUNCTION_APP='svrc26hk-recruit-fn-test'
SOURCE_SHA='17c33b4ce84b858191df26b1ca4ee5ead446fcb2'
REPO_URL='https://github.com/shorevest/website.git'

for cmd in az git node npm pwsh jq curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required command: $cmd" >&2; exit 1; }
done

az account set --subscription "$SUBSCRIPTION_ID"
[[ "$(az account show --query id -o tsv)" == "$SUBSCRIPTION_ID" ]] || { echo 'Wrong Azure subscription.' >&2; exit 1; }
[[ "$(az account show --query tenantId -o tsv)" == "$TENANT_ID" ]] || { echo 'Wrong Azure tenant.' >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo 'Downloading patched recruitment backend...'
git init -q "$WORK/repo"
git -C "$WORK/repo" remote add origin "$REPO_URL"
git -C "$WORK/repo" fetch -q --depth 1 origin "$SOURCE_SHA"
git -C "$WORK/repo" checkout -q --detach FETCH_HEAD

echo 'Building immutable Function package...'
(
  cd "$WORK/repo/services/recruitment-functions"
  npm ci --ignore-scripts --no-audit --no-fund
)
pwsh -NoProfile -File "$WORK/repo/services/recruitment-functions/scripts/package.ps1" \
  -CommitSha "$SOURCE_SHA" \
  -OutputPath "$WORK/recruitment-functions.zip"

echo 'Deploying patched Function package...'
deployed=false
for attempt in 1 2 3 4; do
  echo "Deployment attempt $attempt of 4"
  if az functionapp deployment source config-zip \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_APP" \
    --src "$WORK/recruitment-functions.zip" \
    --build-remote false \
    --timeout 600 \
    --output none; then
    deployed=true
    break
  fi
  echo 'Latest Azure deployment log:'
  az functionapp log deployment show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_APP" \
    --output table || true
  sleep $((attempt * 30))
done
[[ "$deployed" == 'true' ]] || { echo 'Azure package deployment failed after 4 attempts.' >&2; exit 1; }

echo 'Waiting for Functions to index...'
expected=(initiateApplication completeUpload finalizeApplication health outboxWorker)
for attempt in $(seq 1 24); do
  names="$(az functionapp function list --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query '[].name' -o tsv 2>/dev/null | sed 's#^.*/##' || true)"
  missing=0
  for name in "${expected[@]}"; do grep -qx "$name" <<<"$names" || missing=$((missing+1)); done
  [[ "$missing" == 0 ]] && break
  if [[ "$attempt" == 24 ]]; then echo 'Functions did not finish indexing.' >&2; exit 1; fi
  sleep 15
done

echo 'Enabling applicant confirmation and ShoreVest team notifications...'
settings="$(az functionapp config appsettings list --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" -o json)"
cutoff="$(jq -r '.[] | select(.name == "RECRUITMENT_OUTBOX_NOT_BEFORE_UTC") | .value' <<<"$settings" | head -n1)"
[[ -n "$cutoff" && "$cutoff" != 'null' ]] || cutoff="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

az functionapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP" \
  --settings \
    RECRUITMENT_API_ENABLED=true \
    RECRUITMENT_CAPTURE_ONLY_MODE=true \
    RECRUITMENT_OUTBOX_DELIVERY_ENABLED=true \
    RECRUITMENT_OUTBOX_NOT_BEFORE_UTC="$cutoff" \
    RECRUITMENT_CANDIDATE_ACK_ENABLED=true \
    RECRUITMENT_CANDIDATE_ACK_TEMPLATE_APPROVED=true \
    RECRUITMENT_CANDIDATE_ACK_MAILBOX=careers@shorevest.com \
    RECRUITMENT_CANDIDATE_ACK_PRIVACY_URL=https://shorevest.com/privacy-policy/ \
    RECRUITMENT_TEAM_NOTIFICATION_ENABLED=true \
    RECRUITMENT_TEAM_NOTIFICATION_MAILBOX=careers@shorevest.com \
    RECRUITMENT_TEAM_NOTIFICATION_RECIPIENTS=careers@shorevest.com,hr@shorevest.com \
    RECRUITMENT_HR_ACCESS_ENABLED=false \
    RECRUITMENT_RETENTION_ENABLED=false \
    RECRUITMENT_RETENTION_DELETION_ENABLED=false \
  --output none

az functionapp restart --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --output none

echo 'Checking live recruitment health...'
healthy=false
for attempt in $(seq 1 30); do
  code="$(curl -sS -o "$WORK/health.json" -w '%{http_code}' "https://${FUNCTION_APP}.azurewebsites.net/api/recruitment/health" || true)"
  if [[ "$code" == 200 ]] && jq -e '.ok == true and .configuration == "valid" and .dependencies == "ready"' "$WORK/health.json" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 10
done

cat "$WORK/health.json" || true
echo
[[ "$healthy" == 'true' ]] || { echo 'Deployment completed but recruitment health is not ready.' >&2; exit 1; }

echo
echo 'SUCCESS: patched recruitment backend is live.'
echo 'Next step: submit ONE test application and confirm:'
echo '  1) applicant receives confirmation email'
echo '  2) careers@shorevest.com receives New ShoreVest application alert'
echo '  3) hr@shorevest.com receives the same internal alert'
