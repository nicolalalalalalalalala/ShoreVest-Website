#!/usr/bin/env bash
set -euo pipefail

SUBSCRIPTION_ID='4146f1fc-590f-4ee4-a7b7-57f15c08c74e'
TENANT_ID='768bd74c-6be4-4c55-b52d-33673e3b8700'
RESOURCE_GROUP='rg-shorevest-recruitment-test-eastasia'
FUNCTION_APP='svrc26hk-recruit-fn-test'
SOURCE_SHA='17c33b4ce84b858191df26b1ca4ee5ead446fcb2'
REPO_URL='https://github.com/shorevest/website.git'

for cmd in az git node npm pwsh jq curl python3; do
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

echo 'Applying current ShoreVest confirmation-email design...'
DISPATCHER="$WORK/repo/services/recruitment-functions/src/outbox/dispatcher.js"
DISPATCHER="$DISPATCHER" python3 <<'PY'
from pathlib import Path
import os, re

path = Path(os.environ['DISPATCHER'])
text = path.read_text(encoding='utf-8')
new_function = r'''function acknowledgementMessage(application, config) {
  const reference = application.applicationReference;
  const role = application.roleTitle;
  const chinese = application.locale === 'zh-CN';
  const privacyUrl = config.privacyNoticeUrl;
  const subject = chinese
    ? `申请已收到 | ${role} | ShoreVest`
    : `Application received | ${role} | ShoreVest`;

  const safeRole = escapeHtml(role);
  const safeReference = escapeHtml(reference);
  const safePrivacyUrl = escapeHtml(privacyUrl);
  const preheader = chinese
    ? `我们已收到您对 ${safeRole} 职位的申请。`
    : `Your application for ${safeRole} has been received.`;

  const copy = chinese
    ? {
      heading: '申请已收到。',
      received: `感谢您申请 ShoreVest 的 <strong>${safeRole}</strong> 职位。我们已收到您的申请，团队将尽快进行审核。`,
      next: '如您的经验与职位要求相符，我们会与您联系。',
      reference: '申请编号',
      cta: '查看招聘职位',
      privacy: '隐私政策',
      footer: 'ShoreVest Careers'
    }
    : {
      heading: 'Application received.',
      received: `Thank you for applying to ShoreVest. We’ve received your application for <strong>${safeRole}</strong> and a member of our team will review it shortly.`,
      next: 'We’ll be in touch if your experience aligns with the role.',
      reference: 'Application reference',
      cta: 'View Open Roles',
      privacy: 'Privacy Policy',
      footer: 'ShoreVest Careers'
    };

  const content = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background:#eef1f3;color:#24313a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eef1f3;">
    <tr>
      <td align="center" style="padding:44px 18px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;font-family:'DIN 2014',Arial,Helvetica,sans-serif;">
          <tr>
            <td align="center" style="padding:0 0 22px 0;font-size:22px;line-height:1;font-weight:700;letter-spacing:2px;color:#26343d;">SHOREVEST</td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #d9dee2;padding:44px 42px;text-align:center;">
              <div style="width:42px;height:3px;background:#a64332;margin:0 auto 28px auto;font-size:0;line-height:0;">&nbsp;</div>
              <h1 style="margin:0 0 20px 0;font-size:30px;line-height:1.15;font-weight:700;color:#26343d;">${copy.heading}</h1>
              <p style="margin:0 auto 16px auto;max-width:470px;font-size:16px;line-height:1.65;color:#47545c;">${copy.received}</p>
              <p style="margin:0 auto 28px auto;max-width:470px;font-size:16px;line-height:1.65;color:#47545c;">${copy.next}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 28px auto;">
                <tr><td style="padding:13px 18px;background:#f2f4f5;font-size:13px;line-height:1.5;color:#6a747a;text-align:left;"><span style="font-weight:700;color:#39464e;">${copy.reference}</span><br><span style="word-break:break-word;">${safeReference}</span></td></tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr><td style="background:#26343d;text-align:center;"><a href="https://shorevest.com/careers.html" style="display:inline-block;padding:13px 24px;color:#ffffff;text-decoration:none;font-size:14px;line-height:1.2;font-weight:700;">${copy.cta}</a></td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 12px 0 12px;font-size:12px;line-height:1.6;color:#738087;">${copy.footer}<br><a href="${safePrivacyUrl}" style="color:#566f66;text-decoration:underline;">${copy.privacy}</a>&nbsp;&middot;&nbsp;<a href="https://shorevest.com/" style="color:#566f66;text-decoration:none;">shorevest.com</a></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: boundedText(subject, 255),
    body: { contentType: 'HTML', content },
    toRecipients: [{ emailAddress: { address: application.candidateEmail } }],
    replyTo: [{ emailAddress: { address: config.mailbox, name: 'ShoreVest Careers' } }]
  };
}'''

pattern = r'function acknowledgementMessage\(application, config\) \{.*?\n\}\n\nfunction teamNotificationMessage'
updated, count = re.subn(pattern, new_function + '\n\nfunction teamNotificationMessage', text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'Could not replace acknowledgement template exactly once (count={count})')
path.write_text(updated, encoding='utf-8')
PY
node --check "$DISPATCHER"

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
  az functionapp log deployment show --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --output table || true
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
CUTOFF="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
az functionapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP" \
  --settings \
    RECRUITMENT_API_ENABLED=true \
    RECRUITMENT_CAPTURE_ONLY_MODE=true \
    RECRUITMENT_OUTBOX_DELIVERY_ENABLED=true \
    RECRUITMENT_OUTBOX_NOT_BEFORE_UTC="$CUTOFF" \
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
echo 'SUCCESS: careers notification hotfix v2 is live.'
echo "Notification cutoff: $CUTOFF"
echo 'IMPORTANT: only a NEW application submitted after this timestamp is a valid test.'
echo 'Expected result:'
echo '  1) applicant gets the new centered confirmation design'
echo '  2) careers@shorevest.com gets New ShoreVest application alert'
echo '  3) hr@shorevest.com gets the same internal alert'