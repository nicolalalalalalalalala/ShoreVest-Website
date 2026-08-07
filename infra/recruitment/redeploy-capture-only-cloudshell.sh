#!/usr/bin/env bash
set -euo pipefail

resource_group='rg-shorevest-recruitment-test-eastasia'
function_app='svrc26hk-recruit-fn-test'
approved_source_sha='fe8e2f63c1b55f1b661b3cefaa462b60045f9bed'
base_script_url='https://raw.githubusercontent.com/shorevest/website/agent/rebuild-recruitment-backend/infra/recruitment/deploy-test-package-cloudshell.sh'

for command in az curl python3 jq bash; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command is missing: $command" >&2
    exit 1
  }
done

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
    echo "Safety check failed: $key must remain false." >&2
    exit 1
  fi
done

echo 'Temporarily disabling the public recruitment API for the package refresh...'
az functionapp config appsettings set \
  --resource-group "$resource_group" \
  --name "$function_app" \
  --settings RECRUITMENT_API_ENABLED=false RECRUITMENT_CAPTURE_ONLY_MODE=false \
  --output none
az functionapp restart --resource-group "$resource_group" --name "$function_app" --output none

work_root="$(mktemp -d)"
trap 'rm -rf "$work_root"' EXIT
base_script="$work_root/deploy.sh"
patched_script="$work_root/deploy-approved.sh"

curl -fsSL "$base_script_url" -o "$base_script"

APPROVED_SOURCE_SHA="$approved_source_sha" BASE_SCRIPT="$base_script" PATCHED_SCRIPT="$patched_script" python3 <<'PY'
import os
import pathlib
import re

source = pathlib.Path(os.environ['BASE_SCRIPT']).read_text(encoding='utf-8')
sha = os.environ['APPROVED_SOURCE_SHA']
patched, count = re.subn(
    r"^source_sha='[0-9a-f]{40}'$",
    f"source_sha='{sha}'",
    source,
    count=1,
    flags=re.MULTILINE,
)
if count != 1:
    raise SystemExit('Could not pin the approved source commit in the deployment script.')
pathlib.Path(os.environ['PATCHED_SCRIPT']).write_text(patched, encoding='utf-8')
PY

chmod 700 "$patched_script"
echo "Redeploying approved recruitment package from $approved_source_sha ..."
ENABLE_CAPTURE_ONLY=true bash "$patched_script"
