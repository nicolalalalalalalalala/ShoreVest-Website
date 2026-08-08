'use strict';

const { NOTIFICATION_EVENTS: EVENTS } = require('../../../../api/recruitment/core/constants');

const PROJECTION_EVENTS = new Set([
  EVENTS.ApplicationReceived,
  EVENTS.DocumentsReady,
  EVENTS.ManualReviewRequired,
  EVENTS.MaliciousFileDetected,
  EVENTS.QuarantineCleanupRequired,
  EVENTS.RetentionPurged
]);

const ACKNOWLEDGEMENT_PROPERTY_ID =
  'String {61d91fcb-ec61-4f51-9a2d-2d6f3307d8bd} Name ShoreVestApplicationReference';
const TEAM_NOTIFICATION_PROPERTY_ID =
  'String {61d91fcb-ec61-4f51-9a2d-2d6f3307d8bd} Name ShoreVestRecruitmentTeamApplicationReference';

function deliveryError(code, message, permanent = false) {
  return Object.assign(new Error(message), { code, permanent });
}

function compactFields(fields) {
  const output = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== undefined) output[key] = value;
  }
  return output;
}

function boundedText(value, maximum) {
  const text = String(value || '');
  return text.length <= maximum ? text : text.slice(0, maximum);
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatSubmittedAt(value, chinese = false) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return String(value || '');

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hour24 = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  if (chinese) {
    return `${year}年${month + 1}月${day}日 ${String(hour24).padStart(2, '0')}:${minutes} UTC`;
  }

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 || 12;
  return `${day} ${months[month]} ${year}, ${hour}:${minutes} ${period} UTC`;
}

function retentionPurged(record, event) {
  return event?.type === EVENTS.RetentionPurged || record?.retentionState === 'Purged';
}

function setNotificationState(fields, prefix, event) {
  fields[`${prefix}NotificationState`] = 'Pending';
  fields[`${prefix}NotificationEventKey`] = event.idempotencyKey;
  fields[`${prefix}NotificationSentAtUtc`] = null;
  fields[`${prefix}NotificationAttemptCount`] = 0;
  fields[`${prefix}NotificationLastErrorCode`] = null;
}

function clearNotificationState(fields, prefix) {
  fields[`${prefix}NotificationState`] = null;
  fields[`${prefix}NotificationEventKey`] = null;
  fields[`${prefix}NotificationSentAtUtc`] = null;
  fields[`${prefix}NotificationAttemptCount`] = null;
  fields[`${prefix}NotificationLastErrorCode`] = null;
}

function applicationFields(application, event = {}) {
  const purged = retentionPurged(application, event);
  const fields = compactFields({
    Title: application.applicationReference,
    ApplicationReference: application.applicationReference,
    RoleId: application.roleId,
    RoleTitle: application.roleTitle,
    RoleDepartment: application.roleDepartment,
    RoleLocation: application.roleLocation,
    Locale: application.locale,
    Source: application.source,
    CandidateName: purged ? '[deleted]' : application.candidateName,
    CandidateEmail: purged ? '[deleted]' : application.candidateEmail,
    CandidateTelephone: purged ? null : application.candidateTelephone,
    CandidateLocation: purged ? null : application.candidateLocation,
    LinkedInUrl: purged ? null : application.linkedInUrl,
    CoverNote: purged ? null : application.coverNote,
    PrivacyNoticeVersion: application.privacyNoticeVersion,
    PrivacyAcceptedAtUtc: application.privacyAcceptedAtUtc,
    InitiatedAtUtc: application.initiatedAtUtc,
    SubmittedAtClientUtc: application.submittedAtClientUtc,
    SubmittedAtServerUtc: application.submittedAtServerUtc,
    FinalizedAtUtc: application.finalizedAtUtc,
    AccuracyConfirmedAtUtc: application.accuracyConfirmedAtUtc,
    CandidateSubmissionStatus: application.candidateSubmissionStatus,
    TechnicalStatus: application.technicalStatus,
    HiringStage: application.hiringStage,
    FileCount: application.fileCount,
    ReadyFileCount: application.readyFileCount,
    RequiresManualReview: application.requiresManualReview,
    RetentionReviewDate: application.retentionReviewDate,
    RetentionCategory: application.retentionCategory,
    RetentionPolicyVersion: application.retentionPolicyVersion,
    RetentionDeleteAfterUtc: application.retentionDeleteAfterUtc,
    RetentionState: application.retentionState,
    RetentionPurgedAtUtc: application.retentionPurgedAtUtc,
    LegalHold: application.legalHold,
    LastUpdatedAtUtc: application.lastUpdatedAtUtc
  });

  if (event.type === EVENTS.ApplicationReceived) {
    fields.NotificationState = 'Pending';
    fields.NotificationEventKey = event.idempotencyKey;
    fields.NotificationSentAtUtc = null;
    fields.NotificationAttemptCount = 0;
    fields.NotificationLastErrorCode = null;
    setNotificationState(fields, 'AppRecv', event);
  }
  if (event.type === EVENTS.DocumentsReady) {
    setNotificationState(fields, 'DocsRdy', event);
  }
  if (purged) {
    fields.NotificationState = null;
    fields.NotificationEventKey = null;
    fields.NotificationSentAtUtc = null;
    fields.NotificationAttemptCount = null;
    fields.NotificationLastErrorCode = null;
    clearNotificationState(fields, 'AppRecv');
    clearNotificationState(fields, 'DocsRdy');
  }
  return fields;
}

function fileFields(file, event = {}) {
  const purged = retentionPurged(file, event);
  return compactFields({
    Title: file.fileReference,
    FileReference: file.fileReference,
    ApplicationReference: file.applicationReference,
    FilePurpose: file.filePurpose,
    OriginalFileName: purged ? '[deleted]' : file.originalFileName,
    DeclaredMimeType: file.declaredMimeType,
    DetectedFileType: file.detectedFileType,
    SizeBytes: file.sizeBytes,
    ExpectedHash: purged ? null : file.expectedHash,
    QuarantineBlobPath: purged ? null : file.quarantineBlobPath,
    CleanBlobPath: purged ? null : file.cleanBlobPath,
    QuarantineRemovalPending: purged ? false : file.quarantineRemovalPending,
    TechnicalStatus: file.technicalStatus,
    ScanResult: file.scanResult,
    ScanEventId: file.scanEventId,
    UploadVerifiedAtUtc: file.uploadVerifiedAtUtc,
    ScanStartedAtUtc: file.scanStartedAtUtc,
    ScanCompletedAtUtc: file.scanCompletedAtUtc,
    ReadyAtUtc: file.readyAtUtc,
    QuarantineRemovedAtUtc: file.quarantineRemovedAtUtc,
    RetentionReviewDate: file.retentionReviewDate,
    RetentionCategory: file.retentionCategory,
    RetentionPolicyVersion: file.retentionPolicyVersion,
    RetentionDeleteAfterUtc: file.retentionDeleteAfterUtc,
    RetentionState: file.retentionState,
    RetentionPurgedAtUtc: file.retentionPurgedAtUtc,
    LegalHold: file.legalHold,
    LastUpdatedAtUtc: file.lastUpdatedAtUtc
  });
}

function acknowledgementMessage(application, config) {
  const rawSubmittedAt = application.submittedAtServerUtc || application.finalizedAtUtc || application.lastUpdatedAtUtc;
  const reference = application.applicationReference;
  const role = application.roleTitle;
  const name = application.candidateName;
  const chinese = application.locale === 'zh-CN';
  const submittedAt = formatSubmittedAt(rawSubmittedAt, chinese);
  const privacyUrl = config.privacyNoticeUrl;
  const subject = chinese
    ? `申请已收到 | ${role} | ShoreVest`
    : `Application received | ${role} | ShoreVest`;

  const safeName = escapeHtml(name);
  const safeRole = escapeHtml(role);
  const safeReference = escapeHtml(reference);
  const safeSubmittedAt = escapeHtml(submittedAt);
  const safePrivacyUrl = escapeHtml(privacyUrl);
  const preheader = chinese
    ? `我们已收到您对 ${safeRole} 职位的申请。`
    : `We have received your application for the ${safeRole} position.`;

  const copy = chinese
    ? {
      greeting: `${safeName}，您好：`,
      thanks: '感谢您对 ShoreVest 的关注。',
      received: `我们已收到您对 <strong>${safeRole}</strong> 职位的申请，招聘团队将对您的申请材料进行审核。`,
      next: '如您的经验与职位要求相符，我们的团队将与您联系并告知后续安排。',
      details: '申请详情',
      position: '职位',
      reference: '申请编号',
      submitted: '提交时间',
      retain: '请保留申请编号，以备后续查询。',
      privacyPrefix: '有关我们如何收集和处理候选人信息的详情，请参阅',
      privacyLabel: '隐私政策',
      security: 'ShoreVest 不会在招聘过程中要求候选人付款，也不会索取密码或银行资料。',
      signature: 'ShoreVest 人力资源团队'
    }
    : {
      greeting: `Dear ${safeName},`,
      thanks: 'Thank you for your interest in ShoreVest.',
      received: `We have received your application for the <strong>${safeRole}</strong> position and our recruitment team will review your submission.`,
      next: 'If your experience is aligned with the requirements of the role, a member of our team will contact you regarding next steps.',
      details: 'Application details',
      position: 'Position',
      reference: 'Application reference',
      submitted: 'Submitted',
      retain: 'Please retain your application reference for your records.',
      privacyPrefix: 'For information on how we collect and process candidate information, please see our',
      privacyLabel: 'Privacy Policy',
      security: 'ShoreVest will never ask a candidate to make a payment or provide passwords or banking information during the recruitment process.',
      signature: 'ShoreVest Human Resources'
    };

  const content = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#1d1d1b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#ffffff;">
    <tr>
      <td align="center" style="padding:36px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;font-family:'DIN 2014',Arial,Helvetica,sans-serif;color:#1d1d1b;">
          <tr>
            <td style="padding:0 0 26px 0;border-bottom:2px solid #a64332;font-size:22px;line-height:1;font-weight:700;letter-spacing:1.8px;">SHOREVEST</td>
          </tr>
          <tr>
            <td style="padding:32px 0 0 0;font-size:16px;line-height:1.65;">
              <p style="margin:0 0 22px 0;">${copy.greeting}</p>
              <p style="margin:0 0 18px 0;">${copy.thanks}</p>
              <p style="margin:0 0 18px 0;">${copy.received}</p>
              <p style="margin:0 0 28px 0;">${copy.next}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 24px;background:#f4f0e7;">
              <div style="margin:0 0 14px 0;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${copy.details}</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;font-family:'DIN 2014',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1d1d1b;">
                <tr><td style="width:165px;padding:3px 12px 3px 0;font-weight:700;vertical-align:top;">${copy.position}</td><td style="padding:3px 0;vertical-align:top;">${safeRole}</td></tr>
                <tr><td style="width:165px;padding:3px 12px 3px 0;font-weight:700;vertical-align:top;">${copy.reference}</td><td style="padding:3px 0;vertical-align:top;word-break:break-word;">${safeReference}</td></tr>
                <tr><td style="width:165px;padding:3px 12px 3px 0;font-weight:700;vertical-align:top;">${copy.submitted}</td><td style="padding:3px 0;vertical-align:top;">${safeSubmittedAt}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 0 0 0;font-size:15px;line-height:1.65;">
              <p style="margin:0 0 20px 0;">${copy.retain}</p>
              <p style="margin:0 0 20px 0;">${copy.privacyPrefix} <a href="${safePrivacyUrl}" style="color:#566f66;text-decoration:underline;">${copy.privacyLabel}</a>.</p>
              <p style="margin:0 0 30px 0;color:#555555;">${copy.security}</p>
              <p style="margin:0;">${copy.signature}<br><a href="https://shorevest.com/" style="color:#566f66;text-decoration:none;">shorevest.com</a></p>
            </td>
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
}

function teamNotificationMessage(application, config) {
  const submittedAt = application.submittedAtServerUtc || application.finalizedAtUtc || application.lastUpdatedAtUtc;
  const reference = application.applicationReference;
  const role = application.roleTitle;
  const subject = `New ShoreVest application - ${role} - ${reference}`;
  const content = [
    'A new application has been submitted through shorevest.com.',
    '',
    `Role: ${role}`,
    `Candidate: ${application.candidateName}`,
    `Email: ${application.candidateEmail}`,
    `Application reference: ${reference}`,
    `Submitted: ${submittedAt}`,
    `Source: ${application.source || 'website'}`,
    '',
    'The application record is being projected to the restricted Recruitment lists. CV files are not attached to recruitment notification emails.',
    '',
    'ShoreVest Careers'
  ].join('\n');

  return {
    subject: boundedText(subject, 255),
    body: { contentType: 'Text', content },
    toRecipients: [{ emailAddress: { address: config.mailbox } }]
  };
}

function classifyAcknowledgementMessages(messages) {
  const items = Array.isArray(messages) ? messages : [];
  if (items.length > 1) {
    throw deliveryError(
      'CANDIDATE_ACKNOWLEDGEMENT_DUPLICATE_STATE',
      'Multiple mailbox messages have the same application acknowledgement key',
      true
    );
  }
  const message = items[0] || null;
  return {
    message,
    sent: Boolean(message && (message.isDraft === false || message.sentDateTime)),
    draft: Boolean(message && message.isDraft === true)
  };
}

function classifyTeamNotificationMessages(messages) {
  const items = Array.isArray(messages) ? messages : [];
  if (items.length > 1) {
    throw deliveryError(
      'TEAM_NOTIFICATION_DUPLICATE_STATE',
      'Multiple mailbox messages have the same recruitment-team notification key',
      true
    );
  }
  const message = items[0] || null;
  return {
    message,
    sent: Boolean(message && (message.isDraft === false || message.sentDateTime)),
    draft: Boolean(message && message.isDraft === true)
  };
}

function createOutboxDispatcher({ graph, config } = {}) {
  const requiredGraphMethods = [
    'upsertListItem',
    'findMessagesByExtendedProperty',
    'getMessage',
    'createDraftMessage',
    'sendDraftMessage'
  ];
  if (!graph || requiredGraphMethods.some((method) => typeof graph[method] !== 'function')) {
    throw deliveryError('GRAPH_ADAPTER_MISSING', 'Microsoft Graph adapter is not configured', true);
  }

  const sharePoint = config?.sharePoint || {};
  const acknowledgement = config?.candidateAcknowledgement || {};
  const teamNotification = config?.teamNotification || {};

  async function loadApplication(event, dependencies) {
    const application = await dependencies.applicationStore.getApplication(event.applicationReference);
    if (!application) {
      throw deliveryError('APPLICATION_PROJECTION_SOURCE_MISSING', 'Application projection source was not found', true);
    }
    return application;
  }

  async function loadFiles(event, dependencies) {
    if (event.fileReference) {
      const file = await dependencies.applicationStore.getFile(event.fileReference);
      if (!file || file.applicationReference !== event.applicationReference) {
        throw deliveryError('FILE_PROJECTION_SOURCE_MISSING', 'File projection source was not found', true);
      }
      return [file];
    }
    if (!dependencies.projectionReader || typeof dependencies.projectionReader.getFilesForApplication !== 'function') {
      throw deliveryError('PROJECTION_READER_MISSING', 'Projection reader is not configured', true);
    }
    const files = await dependencies.projectionReader.getFilesForApplication(event.applicationReference);
    if (!Array.isArray(files) || files.length === 0) {
      throw deliveryError('FILE_PROJECTION_SOURCE_MISSING', 'No files were found for the application', true);
    }
    return files;
  }

  async function project(event, dependencies) {
    const application = await loadApplication(event, dependencies);
    const finalizedStatus = ['Submitted', 'Deleted'].includes(application.candidateSubmissionStatus);
    if (!application.finalizedAtUtc || !finalizedStatus) {
      return {
        deliveryReference: `deferred:${event.type}:${application.applicationReference}`,
        skipped: true,
        reason: 'APPLICATION_NOT_FINALIZED'
      };
    }
    const files = await loadFiles(event, dependencies);
    const applicationItem = await graph.upsertListItem({
      siteId: sharePoint.siteId,
      listId: sharePoint.applicationsListId,
      keyField: 'ApplicationReference',
      keyValue: application.applicationReference,
      fields: applicationFields(application, event)
    });
    const fileItems = [];
    for (const file of files) {
      const projected = await graph.upsertListItem({
        siteId: sharePoint.siteId,
        listId: sharePoint.filesListId,
        keyField: 'FileReference',
        keyValue: file.fileReference,
        fields: fileFields(file, event)
      });
      fileItems.push(projected);
    }
    return {
      deliveryReference: [
        `application:${applicationItem.itemId}`,
        ...fileItems.map((item) => `file:${item.itemId}`)
      ].join('|')
    };
  }

  async function acknowledge(event, dependencies) {
    if (acknowledgement.enabled !== true || acknowledgement.templateApproved !== true) {
      throw deliveryError('CANDIDATE_ACKNOWLEDGEMENT_DISABLED', 'Candidate acknowledgement is not approved and enabled', true);
    }
    if (!dependencies.outboxCheckpoint || typeof dependencies.outboxCheckpoint.checkpoint !== 'function') {
      throw deliveryError('OUTBOX_CHECKPOINT_MISSING', 'Outbox checkpoint store is not configured', true);
    }
    const application = await loadApplication(event, dependencies);
    if (!application.finalizedAtUtc || application.candidateSubmissionStatus !== 'Submitted') {
      throw deliveryError('APPLICATION_NOT_FINALIZED', 'Candidate acknowledgement requires a finalized application', true);
    }

    const mailbox = acknowledgement.mailbox;
    const reference = application.applicationReference;
    let activeEvent = event;
    const mailboxState = classifyAcknowledgementMessages(
      await graph.findMessagesByExtendedProperty(mailbox, ACKNOWLEDGEMENT_PROPERTY_ID, reference)
    );
    if (mailboxState.sent) {
      return { deliveryReference: `mail:${mailboxState.message.id}`, event: activeEvent, reconciled: true };
    }

    const checkpointedId = activeEvent.deliveryCheckpoint?.draftMessageId;
    let draft = mailboxState.draft ? mailboxState.message : null;
    if (checkpointedId) {
      const checkpointedMessage = await graph.getMessage(mailbox, checkpointedId);
      if (checkpointedMessage && (checkpointedMessage.isDraft === false || checkpointedMessage.sentDateTime)) {
        return { deliveryReference: `mail:${checkpointedMessage.id}`, event: activeEvent, reconciled: true };
      }
      if (checkpointedMessage?.isDraft === true) {
        draft = checkpointedMessage;
      } else if (!draft) {
        throw deliveryError(
          'CANDIDATE_ACKNOWLEDGEMENT_STATE_UNCERTAIN',
          'The checkpointed acknowledgement message could not be reconciled'
        );
      }
    }

    if (!draft) {
      draft = await graph.createDraftMessage(
        mailbox,
        acknowledgementMessage(application, acknowledgement),
        { id: ACKNOWLEDGEMENT_PROPERTY_ID, value: reference }
      );
    }
    if (!draft?.id) {
      throw deliveryError('CANDIDATE_ACKNOWLEDGEMENT_DRAFT_INVALID', 'Microsoft Graph did not return a draft id');
    }
    if (checkpointedId !== draft.id) {
      activeEvent = await dependencies.outboxCheckpoint.checkpoint(activeEvent, {
        draftMessageId: draft.id,
        extendedPropertyId: ACKNOWLEDGEMENT_PROPERTY_ID,
        extendedPropertyValue: reference
      });
    }
    try {
      await graph.sendDraftMessage(mailbox, draft.id);
    } catch (error) {
      error.event = activeEvent;
      throw error;
    }
    return { deliveryReference: `mail:${draft.id}`, event: activeEvent };
  }

  async function notifyTeam(event, dependencies) {
    if (teamNotification.enabled !== true) {
      throw deliveryError('TEAM_NOTIFICATION_DISABLED', 'Recruitment-team notification is not enabled', true);
    }
    if (!dependencies.outboxCheckpoint || typeof dependencies.outboxCheckpoint.checkpoint !== 'function') {
      throw deliveryError('OUTBOX_CHECKPOINT_MISSING', 'Outbox checkpoint store is not configured', true);
    }
    const application = await loadApplication(event, dependencies);
    if (!application.finalizedAtUtc || application.candidateSubmissionStatus !== 'Submitted') {
      throw deliveryError('APPLICATION_NOT_FINALIZED', 'Recruitment-team notification requires a finalized application', true);
    }

    const mailbox = teamNotification.mailbox;
    const reference = application.applicationReference;
    let activeEvent = event;
    const mailboxState = classifyTeamNotificationMessages(
      await graph.findMessagesByExtendedProperty(mailbox, TEAM_NOTIFICATION_PROPERTY_ID, reference)
    );
    if (mailboxState.sent) {
      return { deliveryReference: `team-mail:${mailboxState.message.id}`, event: activeEvent, reconciled: true };
    }

    const checkpointedId = activeEvent.deliveryCheckpoint?.teamNotificationDraftMessageId;
    let draft = mailboxState.draft ? mailboxState.message : null;
    if (checkpointedId) {
      const checkpointedMessage = await graph.getMessage(mailbox, checkpointedId);
      if (checkpointedMessage && (checkpointedMessage.isDraft === false || checkpointedMessage.sentDateTime)) {
        return { deliveryReference: `team-mail:${checkpointedMessage.id}`, event: activeEvent, reconciled: true };
      }
      if (checkpointedMessage?.isDraft === true) {
        draft = checkpointedMessage;
      } else if (!draft) {
        throw deliveryError(
          'TEAM_NOTIFICATION_STATE_UNCERTAIN',
          'The checkpointed recruitment-team notification could not be reconciled'
        );
      }
    }

    if (!draft) {
      draft = await graph.createDraftMessage(
        mailbox,
        teamNotificationMessage(application, teamNotification),
        { id: TEAM_NOTIFICATION_PROPERTY_ID, value: reference }
      );
    }
    if (!draft?.id) {
      throw deliveryError('TEAM_NOTIFICATION_DRAFT_INVALID', 'Microsoft Graph did not return a recruitment-team draft id');
    }
    if (checkpointedId !== draft.id) {
      activeEvent = await dependencies.outboxCheckpoint.checkpoint(activeEvent, {
        teamNotificationDraftMessageId: draft.id,
        teamNotificationExtendedPropertyId: TEAM_NOTIFICATION_PROPERTY_ID,
        teamNotificationExtendedPropertyValue: reference
      });
    }
    try {
      await graph.sendDraftMessage(mailbox, draft.id);
    } catch (error) {
      error.event = activeEvent;
      throw error;
    }
    return { deliveryReference: `team-mail:${draft.id}`, event: activeEvent };
  }

  async function deliver(event, dependencies) {
    if (!event || typeof event.type !== 'string' || typeof event.applicationReference !== 'string') {
      throw deliveryError('OUTBOX_EVENT_INVALID', 'Outbox event is invalid', true);
    }
    if (event.type === EVENTS.CandidateAcknowledgementRequested) return acknowledge(event, dependencies);
    if (event.type === EVENTS.ApplicationReceived) {
      const projection = await project(event, dependencies);
      if (projection.skipped) return projection;
      const teamDelivery = await notifyTeam(event, dependencies);
      return {
        deliveryReference: `${projection.deliveryReference}|${teamDelivery.deliveryReference}`,
        event: teamDelivery.event || event,
        reconciled: teamDelivery.reconciled === true
      };
    }
    if (PROJECTION_EVENTS.has(event.type)) return project(event, dependencies);
    throw deliveryError('OUTBOX_EVENT_UNSUPPORTED', `Unsupported recruitment outbox event: ${event.type}`, true);
  }

  return { deliver, project, acknowledge, notifyTeam };
}

module.exports = {
  PROJECTION_EVENTS,
  ACKNOWLEDGEMENT_PROPERTY_ID,
  TEAM_NOTIFICATION_PROPERTY_ID,
  compactFields,
  applicationFields,
  fileFields,
  acknowledgementMessage,
  teamNotificationMessage,
  classifyAcknowledgementMessages,
  classifyTeamNotificationMessages,
  createOutboxDispatcher
};
