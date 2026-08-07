# Recruitment Microsoft 365 setup

This setup is administrative and must be completed before recruitment outbox delivery is enabled. It does not make the public Careers page or application form live.

## Separation of duties

Use two separate permission contexts:

1. **Provisioning administrator**
   - Creates and configures the two SharePoint lists.
   - Grants the recruitment managed identity selected access to those lists.
   - Grants and scopes mailbox permissions for candidate acknowledgements.
   - May use temporary delegated or application permissions such as `Sites.Manage.All` only for setup.

2. **Recruitment Function managed identity**
   - Must not create lists, administer sites, list storage keys, or access unrelated SharePoint content.
   - Uses `Lists.SelectedOperations.Selected` with write access granted only to:
     - `RecruitmentApplications`
     - `RecruitmentFiles`
   - Uses Microsoft Graph application permissions `Mail.ReadWrite` and `Mail.Send`, restricted to the designated recruitment mailbox through Exchange Online application access controls.
   - Must not have unrestricted access to employee, investor, shared, or executive mailboxes.

The runtime list permission is recorded in `infra/recruitment/sharepoint-lists.v1.json`. The list contract is validated in CI.

## SharePoint lists

Create exactly two generic lists in the approved HR-restricted SharePoint site:

- `RecruitmentApplications`
- `RecruitmentFiles`

Do not use a SharePoint document library for CV storage. Do not enable public upload links. Do not attach CVs to SharePoint items. Candidate documents remain in the private Azure Blob Storage containers.

Use the internal column names, types, choices, unique keys, and indexes defined in:

`infra/recruitment/sharepoint-lists.v1.json`

After provisioning, record the immutable identifiers as Function App settings:

- `RECRUITMENT_SHAREPOINT_SITE_ID`
- `RECRUITMENT_APPLICATIONS_LIST_ID`
- `RECRUITMENT_FILES_LIST_ID`

List display names are not sufficient because they can be renamed.

## Selected list permission

The managed identity must first have the Microsoft Graph application scope `Lists.SelectedOperations.Selected` consented in Microsoft Entra ID. A SharePoint administrator must then grant the identity write access to each of the two specific list resources.

Granting the scope without the resource grant does not provide access. Granting a list permission without the consented scope also does not provide access.

No permission should be granted to the broader site unless list-level selected permissions are unavailable in the tenant and an explicit security exception is approved.

## Candidate acknowledgement mailbox

Set the approved sender mailbox using:

`RECRUITMENT_CANDIDATE_ACK_MAILBOX`

Before enabling candidate acknowledgements:

- approve the English and Chinese wording;
- set `RECRUITMENT_CANDIDATE_ACK_TEMPLATE_APPROVED=true`;
- consent `Mail.ReadWrite` and `Mail.Send` for the managed identity;
- restrict both permissions to the approved recruitment mailbox through Exchange Online application access controls;
- verify that the identity cannot read or send from any other mailbox;
- verify the mailbox records sent messages;
- confirm the privacy notice URL in `RECRUITMENT_CANDIDATE_ACK_PRIVACY_URL`;
- test duplicate-delivery recovery before production.

The acknowledgement contains no attachments, CV links, clean Blob URLs, internal SharePoint links, or reusable SAS URLs.

### Recoverable delivery sequence

Candidate acknowledgement delivery uses a recoverable draft workflow rather than a direct fire-and-forget `sendMail` call:

1. Search the recruitment mailbox for a message carrying the deterministic ShoreVest application-reference extended property.
2. If a matching sent message exists, reconcile the outbox event as delivered without sending again.
3. If no message exists, create a draft tagged with that extended property.
4. Persist the draft's immutable Microsoft Graph message ID to the Cosmos outbox event using the current ETag.
5. Send that exact draft.
6. Mark the outbox event complete using the checkpointed ETag.

If the process crashes before the checkpoint, the next run adopts the tagged draft. If it crashes after the checkpoint, the next run reuses the immutable message ID. If it crashes after send but before the outbox completion write, the next run finds the sent message and completes without sending a duplicate.

More than one mailbox message with the same ShoreVest application-reference property is treated as a permanent reconciliation failure requiring administrator review. A missing checkpointed message is not silently replaced with a new draft.

## Runtime settings

Keep these disabled until the lists, permissions, mailbox restriction, and tests are complete:

- `RECRUITMENT_OUTBOX_DELIVERY_ENABLED=false`
- `RECRUITMENT_CANDIDATE_ACK_ENABLED=false`
- `RECRUITMENT_HR_ACCESS_ENABLED=false`
- `RECRUITMENT_RETENTION_ENABLED=false`
- `RECRUITMENT_RETENTION_DELETION_ENABLED=false`
- `RECRUITMENT_API_ENABLED=false`

The backend configuration validator rejects an enabled API unless abuse controls, SharePoint identifiers, outbox delivery, candidate acknowledgement, mailbox configuration, managed identity, HR authorization, and approved retention configuration are all present.

## Power Automate

Power Automate is limited to two HR notification flows. They must use separate state columns so one event cannot overwrite the other.

### New application received

Use only:

- `AppRecvNotificationState`
- `AppRecvNotificationEventKey`
- `AppRecvNotificationSentAtUtc`
- `AppRecvNotificationAttemptCount`
- `AppRecvNotificationLastErrorCode`

### Documents clean and ready

Use only:

- `DocsRdyNotificationState`
- `DocsRdyNotificationEventKey`
- `DocsRdyNotificationSentAtUtc`
- `DocsRdyNotificationAttemptCount`
- `DocsRdyNotificationLastErrorCode`

Each flow must:

- run with trigger concurrency control enabled;
- process only its own `...NotificationState=Pending` field;
- atomically claim its own state by changing `Pending` to `Sending`;
- use its own `...NotificationEventKey` as the stable event identifier;
- finish as `Sent` or `Failed`;
- increment its own attempt count;
- write its own sent timestamp or last error code;
- send summary information and internal SharePoint links only;
- never attach candidate documents or include public or reusable document links.

The legacy generic `Notification*` columns remain only for migration compatibility with the initial application-received flow. New flow configuration must use the event-specific fields above.

## Verification checklist

Before enabling delivery, verify:

- the Function identity cannot list unrelated sites or lists;
- both key columns enforce unique values;
- indexed columns match the versioned contract;
- SharePoint items contain metadata only;
- the candidate mailbox is the only mailbox accessible to the identity;
- a repeated application projection updates the existing item instead of creating a duplicate;
- the two HR notification flows can both remain pending without overwriting each other;
- a crash before, during, and after candidate mail send does not create a duplicate acknowledgement;
- failed Graph calls remain retryable and preserve the checkpointed outbox ETag;
- the mailbox extended-property search returns at most one message for each application reference;
- all enablement settings remain false in the deployment templates until final approval.
