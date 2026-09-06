# Recruitment careers/application — go-live status

Status: **staged, safely OFF.** The public careers + secure online application flow is
built, wired and tested. It is held behind one master switch pending a verified
end-to-end CV upload against the deployed backend.

## Current safe state

- `assets/data/recruitment/public-config.json` → `openRolesEnabled: false`.
  The careers pages render their "no current vacancies" empty state and role-detail
  pages return visitors to it. Nothing is publicly linked.
- `applicationsEnabled: true`, `apiBase` points at the test Function App
  (`svrc26hk-recruit-fn-test`), Turnstile site key present. So the dedicated
  application page itself is functional and reachable by direct URL (it is `noindex`),
  which is exactly what allows a private end-to-end test before launch.

## Fixed in this change

- **`assets/js/recruitment-role-detail.js`** — the English "Apply for this role" link
  built `'/careers/' + '/apply/'` = `/careers//apply/…` (a malformed double-slash path).
  Corrected to `/careers/apply.html?role=…&source=website`, matching the Chinese branch
  and the dedicated application page. Role detail now renders a working apply action.
- **`infra/recruitment/main.bicep`** — the Key Vault Secrets User role definition id had
  a stray trailing character (an invalid GUID) that would fail the managed-identity role
  assignment at deploy. Corrected.
- **`tests/recruitment-static-security.test.js`** — aligned the master-switch assertion to
  the safe staged value (`openRolesEnabled === false`) so CI is green in the real,
  intended pre-launch state while every other security check (secure client, `noindex`
  apply pages, no secrets, no email/mock, approved roles) is preserved unchanged.

## The go-live blocker (why the switch stays off) — CONFIRMED root cause (2026-09-06)

The online submission itself works end-to-end on the deployed backend (a real fake-data
submission returned "Application received", the CV landed in `recruitment-quarantine`, and
candidate + HR notifications were delivered with no CV attached). But the **malware
scan → promote-to-clean step never runs**, so every uploaded CV is stuck at `ScanPending`
and never becomes reviewer-retrievable in `recruitment-clean`.

Diagnosed against Azure:

- The Event Grid scan-result topic showed **zero** publishes ever (`PublishSuccessCount`
  null across the whole window) — Defender never emitted a single scan result.
- `Microsoft.Security/pricings/StorageAccounts` on the subscription is **`Free`**.
  Defender for Storage malware scanning is a **paid** feature; on the Free tier the
  resource-level `onUpload.isEnabled: true` flag is cosmetic and nothing actually scans.

This is an Azure plan/config gap, **not** a code bug — which is why the site correctly
stays OFF and `openRolesEnabled` is untouched.

## Remediation in progress — free self-hosted ClamAV scanner

Rather than enable the paid Defender plan, the scan source is being replaced with a free,
self-hosted **ClamAV** scanner that keeps every CV inside the tenant. Only the scan source
changes; the existing `processScanResult` state machine (promote/block/manual-review/
notify) is reused unchanged. See **`docs/recruitment/MALWARE_SCANNING_CLAMAV.md`** for the
architecture, cost, deploy steps and the required functional round-trip test. Code +
Bicep + tests are staged in this branch; deployment happens via Cloud Shell.

## Go-live checklist (do these, in order)

1. **Stand up the ClamAV scanner** and pass the functional round-trip test in
   `MALWARE_SCANNING_CLAMAV.md`: a clean CV must reach `recruitment-clean` and be
   reviewer-retrievable, an EICAR test file must be classified `Malicious` and blocked,
   and Cosmos must move `ScanPending → Ready`/`Blocked`. Re-drive the CVs currently stuck
   at `ScanPending`.
2. **Point `apiBase` at a production backend.** Today it targets the *test* Function App;
   a production launch should not send real candidate PII to test infrastructure. Stand up
   (or designate) the production recruitment environment and update `apiBase`.
3. **Reconcile the committed backend with the deployed one** (the deployed app carries
   finalize, SharePoint projection, HR access, candidate ack, retention) so the repo is the
   source of truth.
4. **Flip the switch (two lines).** Only after 1–3: set `openRolesEnabled: true` in
   `assets/data/recruitment/public-config.json` and update the matching assertion in
   `tests/recruitment-static-security.test.js` to `true`.
