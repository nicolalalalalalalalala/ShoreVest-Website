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

## The go-live blocker (why the switch stays off)

The application client (`assets/js/recruitment-application.js`) performs a **three-step**
submission: `POST /applications/initiate` → `PUT` the CV to the returned short-lived SAS
URL → `POST /applications/complete` → `POST /applications/finalize`, expecting a
`finalizationToken` from `complete` and a final application reference from `finalize`.

The Function App **committed in this repo** (`services/recruitment-functions`) implements
only `initiate` and `complete` — there is **no `finalize` route and no `finalizationToken`**.
So against the committed backend the flow fails at the final step (the client shows an
error, never a false success). The frontend was written against a **newer** backend than
the one committed here; the deployed test app carries settings for that newer contract
(candidate acknowledgement, SharePoint, HR access, retention) and very likely implements
`finalize`, but that could not be verified from CI (the backend is unreachable from the
build environment and Turnstile requires a real browser).

## Go-live checklist (do these, in order)

1. **Verify a real CV upload end-to-end.** In a browser, open
   `https://shorevest.com/careers/apply.html?role=legal-assistant&source=website`
   (it is live and `noindex` even while Open Roles are hidden). Complete the form with
   **fake candidate data**, upload a test PDF/DOCX, pass Turnstile, and submit. Expect
   "Application received" with a reference — and confirm the file actually lands in the
   `recruitment-quarantine` container and a record appears in Cosmos `submissions`.
   - If it succeeds → the deployed backend implements the full contract; proceed.
   - If it errors at submission → the deployed backend is missing `finalize`; reconcile
     `services/recruitment-functions` with the deployed source before launch.
2. **Point `apiBase` at a production backend.** Today it targets the *test* Function App;
   a production launch should not send real candidate PII to test infrastructure. Stand up
   (or designate) the production recruitment environment and update `apiBase`.
3. **Reconcile the committed backend with the deployed one.** The deployed app is ahead of
   this repo (finalize, SharePoint projection, HR access, candidate ack, retention). Bring
   `services/recruitment-functions` up to that source so the repo is the source of truth.
4. **Flip the switch (two lines).** Set `openRolesEnabled: true` in
   `assets/data/recruitment/public-config.json` and update the matching assertion in
   `tests/recruitment-static-security.test.js` to `true`.
