'use strict';

const RETENTION_CATEGORIES = Object.freeze({
  Incomplete: 'Incomplete',
  Submitted: 'Submitted',
  Malicious: 'Malicious'
});

function addMilliseconds(value, milliseconds) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + milliseconds).toISOString();
}

function categoryForApplication(application) {
  if (!application || typeof application !== 'object') return null;
  if (application.technicalStatus === 'Blocked' || application.blockedAtUtc) {
    return RETENTION_CATEGORIES.Malicious;
  }
  if (application.candidateSubmissionStatus === 'Submitted' || application.finalizedAtUtc) {
    return RETENTION_CATEGORIES.Submitted;
  }
  return RETENTION_CATEGORIES.Incomplete;
}

function policyForApplication(application, config) {
  if (!config?.enabled || !config.policyVersion) return null;
  const category = categoryForApplication(application);
  let anchor;
  let durationMs;

  if (category === RETENTION_CATEGORIES.Malicious) {
    anchor = application.blockedAtUtc || application.lastUpdatedAtUtc;
    durationMs = config.maliciousDays * 24 * 60 * 60 * 1000;
  } else if (category === RETENTION_CATEGORIES.Submitted) {
    anchor = application.finalizedAtUtc || application.submittedAtServerUtc || application.lastUpdatedAtUtc;
    durationMs = config.submittedDays * 24 * 60 * 60 * 1000;
  } else {
    anchor = application.initiatedAtUtc || application.lastUpdatedAtUtc;
    durationMs = config.incompleteHours * 60 * 60 * 1000;
  }

  const retentionDeleteAfterUtc = addMilliseconds(anchor, durationMs);
  if (!retentionDeleteAfterUtc) return null;
  return {
    retentionCategory: category,
    retentionPolicyVersion: config.policyVersion,
    retentionDeleteAfterUtc
  };
}

function policyNeedsUpdate(application, policy) {
  if (!application || !policy) return false;
  return application.retentionCategory !== policy.retentionCategory ||
    application.retentionPolicyVersion !== policy.retentionPolicyVersion ||
    application.retentionDeleteAfterUtc !== policy.retentionDeleteAfterUtc ||
    application.legalHold == null;
}

function validateRetentionControl(input, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errorCode: 'RETENTION_CONTROL_INVALID' };
  }
  const allowed = new Set(['legalHold', 'retentionDeleteAfterUtc', 'reason']);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return { ok: false, errorCode: 'RETENTION_CONTROL_INVALID' };
  }
  if (typeof input.legalHold !== 'boolean') {
    return { ok: false, errorCode: 'RETENTION_CONTROL_INVALID' };
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 500) {
    return { ok: false, errorCode: 'RETENTION_REASON_INVALID' };
  }

  let retentionDeleteAfterUtc = null;
  if (input.retentionDeleteAfterUtc != null) {
    const timestamp = Date.parse(input.retentionDeleteAfterUtc);
    if (!Number.isFinite(timestamp)) {
      return { ok: false, errorCode: 'RETENTION_DATE_INVALID' };
    }
    if (timestamp < now.getTime() - 5 * 60 * 1000) {
      return { ok: false, errorCode: 'RETENTION_DATE_INVALID' };
    }
    retentionDeleteAfterUtc = new Date(timestamp).toISOString();
  }

  if (input.legalHold !== true && !retentionDeleteAfterUtc) {
    return { ok: false, errorCode: 'RETENTION_DATE_REQUIRED' };
  }

  return {
    ok: true,
    control: {
      legalHold: input.legalHold,
      retentionDeleteAfterUtc,
      reason: input.reason.trim()
    }
  };
}

module.exports = {
  RETENTION_CATEGORIES,
  addMilliseconds,
  categoryForApplication,
  policyForApplication,
  policyNeedsUpdate,
  validateRetentionControl
};
