#!/usr/bin/env bash
set -euo pipefail

subscription_id='4146f1fc-590f-4ee4-a7b7-57f15c08c74e'
tenant_id='768bd74c-6be4-4c55-b52d-33673e3b8700'
resource_group='rg-shorevest-recruitment-test-eastasia'
function_app='svrc26hk-recruit-fn-test'
repository_url='https://github.com/shorevest/website.git'
source_sha='c5f7b21a93218c9e0d9d2e77413129c89b923186'
enable_capture_only="${ENABLE_CAPTURE_ONLY:-false}"

for command in az git node npm python3 jq curl; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command is missing: $command" >&2
    exit 1
  }
done

actual_tenant="$(az account show --query tenantId -o tsv)"
if [[ "$actual_tenant" != "$tenant_id" ]]; then
  echo "Azure is signed into the wrong tenant: $actual_tenant" >&2
  exit 1
fi

az account set --subscription "$subscription_id"

work_root="$(mktemp -d)"
trap 'rm -rf "$work_root"' EXIT
repo_root="$work_root/repo"
stage_root="$work_root/stage"
package_path="$work_root/recruitment-functions.zip"

settings_json="$(az functionapp config appsettings list \
  --resource-group "$resource_group" \
  --name "$function_app" \
  --output json)"

for key in \
  RECRUITMENT_API_ENABLED \
  RECRUITMENT_OUTBOX_DELIVERY_ENABLED \
  RECRUITMENT_CANDIDATE_ACK_ENABLED \
  RECRUITMENT_HR_ACCESS_ENABLED \
  RECRUITMENT_RETENTION_ENABLED \
  RECRUITMENT_RETENTION_DELETION_ENABLED; do
  value="$(jq -r --arg key "$key" '.[] | select(.name == $key) | .value' <<<"$settings_json")"
  if [[ "${value,,}" != 'false' ]]; then
    echo "Safety check failed: $key must remain false before this deployment." >&2
    exit 1
  fi
done

echo 'Downloading the approved recruitment source...'
git init -q "$repo_root"
git -C "$repo_root" remote add origin "$repository_url"
git -C "$repo_root" fetch -q --depth 1 origin "$source_sha"
git -C "$repo_root" checkout -q --detach FETCH_HEAD

service_root="$repo_root/services/recruitment-functions"

echo 'Installing production Function dependencies...'
(
  cd "$service_root"
  npm ci --omit=dev --no-audit --no-fund
)

mkdir -p \
  "$stage_root/services/recruitment-functions" \
  "$stage_root/api/recruitment" \
  "$stage_root/assets/data"

cp "$service_root/host.json" "$stage_root/host.json"
cp "$service_root/package.json" "$stage_root/services/recruitment-functions/package.json"
cp "$service_root/package-lock.json" "$stage_root/services/recruitment-functions/package-lock.json"
cp -a "$service_root/src" "$stage_root/services/recruitment-functions/src"
cp -a "$service_root/node_modules" "$stage_root/services/recruitment-functions/node_modules"
cp -a "$repo_root/api/recruitment/core" "$stage_root/api/recruitment/core"
cp -a "$repo_root/assets/data/recruitment" "$stage_root/assets/data/recruitment"

STAGE_ROOT="$stage_root" SOURCE_SHA="$source_sha" PACKAGE_PATH="$package_path" python3 <<'PY'
import datetime
import hashlib
import json
import os
import pathlib
import zipfile

stage = pathlib.Path(os.environ['STAGE_ROOT'])
source_sha = os.environ['SOURCE_SHA'].lower()
package_path = pathlib.Path(os.environ['PACKAGE_PATH'])

service_package_path = stage / 'services/recruitment-functions/package.json'
service_package = json.loads(service_package_path.read_text(encoding='utf-8'))
service_package['main'] = 'services/recruitment-functions/src/functions/index.js'
(stage / 'package.json').write_text(
    json.dumps(service_package, indent=2, ensure_ascii=False) + '\n',
    encoding='utf-8',
)

payload_lines = []
for path in sorted(p for p in stage.rglob('*') if p.is_file()):
    relative = path.relative_to(stage).as_posix()
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    payload_lines.append(f'{relative}\n{digest}')
payload_digest = hashlib.sha256('\n'.join(payload_lines).encode('utf-8')).hexdigest()

metadata = {
    'sourceCommit': source_sha,
    'packagedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'payloadSha256': payload_digest,
    'payloadSha256Scope': 'staged-files-excluding-deployment-metadata',
    'archiveSha256Sidecar': package_path.name + '.sha256',
}
(stage / 'deployment-metadata.json').write_text(
    json.dumps(metadata, indent=2) + '\n',
    encoding='utf-8',
)

with zipfile.ZipFile(package_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(p for p in stage.rglob('*') if p.is_file()):
        archive.write(path, path.relative_to(stage).as_posix())

archive_digest = hashlib.sha256(package_path.read_bytes()).hexdigest()
package_path.with_suffix(package_path.suffix + '.sha256').write_text(
    f'{archive_digest}  {package_path.name}\n',
    encoding='utf-8',
)
print(f'Package SHA-256: {archive_digest}')
PY

(
  cd "$stage_root"
  node -e "require('./services/recruitment-functions/src/appFactory.js'); require('./services/recruitment-functions/src/functions/index.js');"
)

echo 'Deploying the capture-only capable package to the disabled test Function App...'
az functionapp deployment source config-zip \
  --resource-group "$resource_group" \
  --name "$function_app" \
  --src "$package_path" \
  --build-remote false \
  --timeout 600 \
  --output none

expected=(
  initiateApplication
  completeUpload
  finalizeApplication
  hrCleanDocumentAccess
  hrRetentionControl
  defenderScanResult
  quarantineCleanup
  retentionPolicyAssignment
  retentionPurge
  retentionIdempotencyCleanup
  outboxWorker
  health
)

for attempt in $(seq 1 20); do
  names="$(az functionapp function list \
    --resource-group "$resource_group" \
    --name "$function_app" \
    --query '[].name' \
    --output tsv 2>/dev/null | sed 's#^.*/##' || true)"

  missing=0
  for expected_name in "${expected[@]}"; do
    if ! grep -qx "$expected_name" <<<"$names"; then
      missing=$((missing + 1))
    fi
  done

  echo "Index check $attempt: $missing expected Functions missing."
  if [[ "$missing" == '0' ]]; then
    break
  fi
  if [[ "$attempt" == '20' ]]; then
    echo 'The package deployed, but not all Functions indexed within ten minutes.' >&2
    exit 1
  fi
  sleep 30
done

settings_json="$(az functionapp config appsettings list \
  --resource-group "$resource_group" \
  --name "$function_app" \
  --output json)"

for key in \
  RECRUITMENT_API_ENABLED \
  RECRUITMENT_OUTBOX_DELIVERY_ENABLED \
  RECRUITMENT_CANDIDATE_ACK_ENABLED \
  RECRUITMENT_HR_ACCESS_ENABLED \
  RECRUITMENT_RETENTION_ENABLED \
  RECRUITMENT_RETENTION_DELETION_ENABLED; do
  value="$(jq -r --arg key "$key" '.[] | select(.name == $key) | .value' <<<"$settings_json")"
  if [[ "${value,,}" != 'false' ]]; then
    echo "Post-deployment safety check failed: $key was enabled." >&2
    exit 1
  fi
done

site_id="$(jq -r '.[] | select(.name == "RECRUITMENT_SHAREPOINT_SITE_ID") | .value' <<<"$settings_json")"
applications_id="$(jq -r '.[] | select(.name == "RECRUITMENT_APPLICATIONS_LIST_ID") | .value' <<<"$settings_json")"
files_id="$(jq -r '.[] | select(.name == "RECRUITMENT_FILES_LIST_ID") | .value' <<<"$settings_json")"

[[ "$site_id" == 'netorgft1774351.sharepoint.com,6957d2cb-ce22-481f-9f71-1b988b0889e6,96a005ee-1795-4ec2-8833-4f84ccd3804f' ]] || {
  echo 'SharePoint site ID verification failed.' >&2
  exit 1
}
[[ "$applications_id" == 'dcbb29ba-e283-4e54-93b2-a700d836acd6' ]] || {
  echo 'RecruitmentApplications list ID verification failed.' >&2
  exit 1
}
[[ "$files_id" == '02937f83-bc3b-4386-ad12-85aafa4d266d' ]] || {
  echo 'RecruitmentFiles list ID verification failed.' >&2
  exit 1
}

echo
echo 'Capture-only capable recruitment package deployed successfully.'

if [[ "${enable_capture_only,,}" != 'true' ]]; then
  echo 'Public API, delivery, HR access and retention remain disabled.'
  exit 0
fi

echo 'Enabling capture-only mode. Delivery, candidate email, HR access and retention will stay OFF.'
az functionapp config appsettings set \
  --resource-group "$resource_group" \
  --name "$function_app" \
  --settings \
    RECRUITMENT_CAPTURE_ONLY_MODE=true \
    RECRUITMENT_API_ENABLED=true \
    RECRUITMENT_OUTBOX_DELIVERY_ENABLED=false \
    RECRUITMENT_CANDIDATE_ACK_ENABLED=false \
    RECRUITMENT_HR_ACCESS_ENABLED=false \
    RECRUITMENT_RETENTION_ENABLED=false \
    RECRUITMENT_RETENTION_DELETION_ENABLED=false \
  --output none

az functionapp restart --resource-group "$resource_group" --name "$function_app" --output none

health_url="https://${function_app}.azurewebsites.net/api/recruitment/health"
healthy=false
for attempt in $(seq 1 18); do
  status="$(curl -sS -o "$work_root/health.json" -w '%{http_code}' "$health_url" || true)"
  if [[ "$status" == '200' ]] && jq -e '.ok == true and .configuration == "valid" and .dependencies == "ready"' "$work_root/health.json" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  echo "Capture-only health check $attempt: HTTP $status. Waiting..."
  sleep 10
done

if [[ "$healthy" != 'true' ]]; then
  echo 'Capture-only health did not become ready. Rolling the public API back OFF.' >&2
  if [[ -s "$work_root/health.json" ]]; then
    cat "$work_root/health.json" >&2 || true
    echo >&2
  fi
  az functionapp config appsettings set \
    --resource-group "$resource_group" \
    --name "$function_app" \
    --settings RECRUITMENT_API_ENABLED=false RECRUITMENT_CAPTURE_ONLY_MODE=false \
    --output none || true
  az functionapp restart --resource-group "$resource_group" --name "$function_app" --output none || true
  exit 1
fi

settings_json="$(az functionapp config appsettings list \
  --resource-group "$resource_group" \
  --name "$function_app" \
  --output json)"

for key in \
  RECRUITMENT_OUTBOX_DELIVERY_ENABLED \
  RECRUITMENT_CANDIDATE_ACK_ENABLED \
  RECRUITMENT_HR_ACCESS_ENABLED \
  RECRUITMENT_RETENTION_ENABLED \
  RECRUITMENT_RETENTION_DELETION_ENABLED; do
  value="$(jq -r --arg key "$key" '.[] | select(.name == $key) | .value' <<<"$settings_json")"
  if [[ "${value,,}" != 'false' ]]; then
    echo "Final safety check failed: $key is not false. Rolling API back OFF." >&2
    az functionapp config appsettings set \
      --resource-group "$resource_group" \
      --name "$function_app" \
      --settings RECRUITMENT_API_ENABLED=false RECRUITMENT_CAPTURE_ONLY_MODE=false \
      --output none || true
    az functionapp restart --resource-group "$resource_group" --name "$function_app" --output none || true
    exit 1
  fi
done

echo
echo 'CAPTURE-ONLY MODE IS READY.'
echo 'The public API can accept and durably store applications.'
echo 'Email delivery, candidate acknowledgements, HR document access and retention actions are still disabled.'
