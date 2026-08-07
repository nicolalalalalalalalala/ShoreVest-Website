# Recruitment Azure Functions backend

> **Warning:** Merging this code does not deploy or enable recruitment applications. The Function App defaults `RECRUITMENT_API_ENABLED=false`, role-level application switches remain disabled, the public Careers feature flag remains off, and no public website application form is added.

## Architecture

Careers page -> Azure Functions HTTP API -> Cosmos DB for NoSQL (`submissions`, `idempotency`, `rateLimits`) -> private Blob containers (`recruitment-quarantine`, `recruitment-clean`) -> optional Microsoft Defender for Storage -> Event Grid -> scan Function -> durable outbox -> restricted SharePoint projection and candidate acknowledgement.

The CV storage endpoint remains network-reachable because candidate browsers upload directly to one exact quarantine Blob using a short-lived user-delegation SAS. This does **not** make the containers public: anonymous Blob access and Shared Key access are disabled, and each upload credential is write-only, HTTPS-only, single-Blob scoped, and short-lived.

## Directory structure

- `services/recruitment-functions/`: Node 20, CommonJS, Azure Functions runtime 4 programming-model-v4 project.
- `services/recruitment-functions/src/adapters/`: Cosmos, Blob, Key Vault, token, fingerprint, Turnstile, rate-limit, Graph, outbox and retention adapters using managed identity.
- `infra/recruitment/`: Flex Consumption, identity-based host/deployment storage, Cosmos, CV Blob Storage, Key Vault, monitoring, Event Grid, Easy Auth, runtime settings, SharePoint contract, role assignments and safe deployment parameters.

## Configuration

Production configuration is centralized through `infra/recruitment/runtime-settings.bicep`. Public API, external delivery, candidate acknowledgement, HR document access, retention and destructive retention all default to disabled.

The enabled production API fails configuration validation unless all abuse controls, managed identity settings, SharePoint identifiers, approved mailbox settings, Easy Auth confirmation, HR role settings and an approved retention policy version are present. The templates write non-secret settings but deliberately do not create secret values.

Turnstile configuration is coupled to the public website origins. `RECRUITMENT_BOT_VERIFICATION_HOSTNAME` is a comma-separated set that must exactly match the hostnames in `RECRUITMENT_ALLOWED_ORIGINS`; the production default is `shorevest.com,www.shorevest.com`. `RECRUITMENT_BOT_VERIFICATION_ACTION` defaults to `recruitment-application`, and the frontend widget must use that exact action.

## Functions host and deployment storage

Flex Consumption uses a dedicated private deployment container and user-assigned managed identity authentication. The same identity is explicitly configured for `AzureWebJobsStorage`, so timer coordination, host keys and deployment package access do not rely on storage account keys or connection strings. The identity receives Storage Blob Data Owner only on the dedicated Functions host/deployment storage account.

## Data design

`submissions` is partitioned by `/applicationReference` and stores `application`, `file:{fileReference}`, completion claims, scan claims, outbox events and retention state in the same application partition. Aggregate updates use Cosmos transactional batches and ETag conditions.

`idempotency` is partitioned by `/idempotencyKey` and stores fingerprints, reservations, leases, generations, expiry metadata and stable result metadata. It never stores live SAS URLs, signed completion/finalization tokens, full candidate details or canonical fingerprint plaintext.

`rateLimits` is partitioned by `/key` with TTL and stores only HMAC-derived request keys. The key is based only on the App Service-overwritten client IP. User agent, candidate data and browser-provided submission IDs do not affect the bucket. Requests without a trusted platform IP share one conservative fallback bucket.

## Submission finalization

Upload verification and candidate submission are separate operations:

1. `POST /recruitment/applications/initiate` validates the role, candidate fields, privacy version, file declaration, bot result and rate limit before issuing one upload URL and an upload-completion token.
2. The candidate uploads directly to the exact quarantine Blob.
3. `POST /recruitment/applications/complete` verifies Blob existence, size, content type, bounded bytes, file signature and SHA-256, then starts the scan state and returns a short-lived finalization token.
4. `POST /recruitment/applications/finalize` requires that token plus explicit privacy and accuracy confirmations.

No HR projection or `ApplicationReceived` notification is produced merely because a file was uploaded or scanned. Successful finalization marks the application submitted and creates idempotent application-received and acknowledgement events.

Defender and browser callbacks may arrive in either order. If Defender reports while the file is still `SASIssued`, the scan Function returns a retryable outcome and Event Grid redelivers after upload completion. If the scan finishes before candidate finalization, the original Ready, Malicious, Manual Review or cleanup outbox event remains retryable until finalization; it is not completed as deferred. Finalization creates a separate recovery event only for an older missing, failed or previously deferred original record, preventing duplicate outcome notifications.

## Abuse controls

Production requests require an approved `Origin`. The Function derives client context from App Service-overwritten client-IP headers, never from candidate JSON, `CF-Connecting-IP`, `X-Forwarded-For`, user agent or submission ID.

Turnstile verification fails closed on missing tokens, invalid responses, hostname mismatch, action mismatch, network failure or missing Key Vault configuration. Rate limiting uses a Cosmos-backed fixed window and an HMAC of the trusted platform client identity, so raw IP addresses are not stored.

Application initiation has an additional runtime wrapper that refuses to call the core flow if either the rate limiter or bot verifier is absent, even if a future dependency-wiring change bypasses configuration validation.

## Blob, SAS and Defender

Upload URLs are user-delegation SAS URLs scoped to one quarantine Blob with create/write only, HTTPS only and at most ten-minute expiry. Clean promotion uses an internal five-minute read SAS for the private quarantine source; that URL is never returned or persisted. The promoted clean Blob is re-read and SHA-256 verified before Ready state is committed.

HR document access requires a finalized application, a clean Defender result, a Ready file state and another full clean-Blob hash verification. The response contains a five-minute, read-only, single-Blob SAS and no internal Blob path.

Defender for Storage is cost-bearing and remains disabled by default through `enableDefenderForStorage=false`. The Event Grid subscription is deployed separately after the Function endpoint exists and filters only `Microsoft.Security.MalwareScanningResult`. Retryable core outcomes throw from the Event Grid handler so delivery is retried; malformed or permanent rejects are acknowledged with generic error codes and no Blob-path logging.

## Managed identity roles

The Bicep grants:

- Cosmos DB Built-in Data Contributor on the recruitment Cosmos account.
- Storage Blob Delegator on the CV storage account, required to request user-delegation keys.
- Storage Blob Data Contributor separately on `recruitment-quarantine` and `recruitment-clean`, not across the full CV storage account.
- Storage Blob Data Owner on the dedicated Functions host/deployment storage account.
- Key Vault Secrets User on the recruitment vault.

It does not grant subscription Owner, resource-group Contributor, Storage Account Contributor, CV-storage account-wide Blob Data Contributor, storage key listing or broad Key Vault administration.

Microsoft Graph and SharePoint permissions are administrator-managed separately: selected write access to exactly two lists, and mailbox-scoped `Mail.ReadWrite` plus `Mail.Send` for the approved recruitment mailbox.

## HR authorization

App Service Authentication injects the authenticated Entra principal. Clean-document access requires the exact `Recruitment.HR` app role; retention and legal-hold administration require the separate `Recruitment.RetentionAdmin` role. Both routes also require an Entra object ID claim so every privileged operation has an auditable actor.

## SharePoint replay behavior

Projection upserts preserve notification state when the stored `NotificationEventKey` matches the replayed event. A crash after an HR notification is sent therefore cannot reset `Sent` to `Pending`. A genuinely different event key can still initialize a new Pending notification state. Candidate CV bytes and public/reusable document links are never written to SharePoint.

## Retention

Retention policy assignment, legal-hold administration, destructive purge and post-purge idempotency cleanup are separate operations. Destructive deletion remains disabled by default. A purge deletes both Blob copies, atomically redacts candidate/file PII in Cosmos, emits a SharePoint redaction event and records any separate idempotency-cleanup failure for retry.

## Local development and validation

Copy `local.settings.example.json` to local untracked settings only if needed. Production code uses managed identity and Key Vault. Validate with:

- `npm run validate:recruitment`
- `npm run check:recruitment`
- `npm run test:recruitment`
- `npm run check:security`
- `npm run check:functions`
- `npm run test:functions`
- `npm run bicep:build:recruitment`
- `npm run bicep:lint:recruitment`

## Rollout, rollback and health

Deployment prerequisites include approved Azure names, populated Key Vault secrets, a deployed Function package, Easy Auth and app-role configuration, selected SharePoint permissions, mailbox restriction, approved privacy/retention decisions, a Turnstile widget using the exact configured action and an explicit decision on paid Defender.

Rollback is disabling the public API and all delivery/access/deletion settings, stopping Event Grid delivery and reverting the Function package.

The health endpoint validates configuration and, when valid, probes Cosmos, both private Blob containers, required Key Vault secrets, the two selected SharePoint lists and the scoped recruitment mailbox. Results are cached briefly and expose only generic `ready` or `unavailable` status, never resource names, secrets, candidate data or dependency-specific errors.

## Not production-ready yet

Production still requires a clean rebase onto current `main`, non-production Azure deployment, full automated CI, end-to-end and failure-injection tests, monitoring/alerts, Power Automate configuration, final HR/Legal/Security approvals, the frontend form and a final enablement review.
