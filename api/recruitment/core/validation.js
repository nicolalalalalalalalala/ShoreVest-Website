'use strict';

const crypto = require('crypto');
const { ERROR_CODES } = require('./constants');
const { ext, hasPathTraversal } = require('./fileTypes');

const LIMITS = {
  fullName: 200,
  email: 254,
  telephone: 50,
  currentLocation: 200,
  linkedinUrl: 300,
  coverNote: 4000,
  originalName: 255
};

const OPTIONAL_TEXT_FIELDS = ['telephone', 'currentLocation', 'linkedinUrl', 'coverNote'];
const REQUIRED_CANDIDATE_FIELDS = ['fullName', 'email'];
const CANDIDATE_FIELDS = new Set([...REQUIRED_CANDIDATE_FIELDS, ...OPTIONAL_TEXT_FIELDS]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BIDI_CONTROL_CHARACTERS = /[\u202a-\u202e\u2066-\u2069]/;
const UNSAFE_SINGLE_LINE_CHARACTERS = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const UNSAFE_MULTILINE_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const UNSAFE_FILENAME_CHARACTERS = UNSAFE_SINGLE_LINE_CHARACTERS;

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf('@');
  return at < 0 ? trimmed : `${trimmed.slice(0, at)}@${trimmed.slice(at + 1).toLowerCase()}`;
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= LIMITS.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validSingleLineText(value, maximum, required = false) {
  if (typeof value !== 'string' || value.length > maximum || UNSAFE_SINGLE_LINE_CHARACTERS.test(value)) {
    return false;
  }
  return required ? Boolean(value.trim()) : true;
}

function validMultilineText(value, maximum) {
  return typeof value === 'string' &&
    value.length <= maximum &&
    !UNSAFE_MULTILINE_CHARACTERS.test(value) &&
    !BIDI_CONTROL_CHARACTERS.test(value);
}

function validLinkedInUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return true;
  try {
    const parsed = new URL(value.trim());
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    return parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      (hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com'));
  } catch (_) {
    return false;
  }
}

function validOriginalFileName(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return Boolean(trimmed) &&
    value.length <= LIMITS.originalName &&
    !hasPathTraversal(value) &&
    !UNSAFE_FILENAME_CHARACTERS.test(value);
}

function validIsoTimestamp(value, now) {
  if (value == null) return true;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return false;
  const parsed = Date.parse(value);
  const futureLimit = now.getTime() + 15 * 60 * 1000;
  const pastLimit = now.getTime() - 366 * 24 * 60 * 60 * 1000;
  return parsed >= pastLimit && parsed <= futureLimit;
}

function role(manifest, roleId, locale, privacyVersion, now) {
  if (typeof roleId !== 'string' || !/^[a-z0-9][a-z0-9-]{2,80}$/.test(roleId)) {
    return { ok: false, errorCode: ERROR_CODES.ROLE_NOT_FOUND };
  }

  const roles = manifest && Array.isArray(manifest.roles) ? manifest.roles : [];
  const foundRole = roles.find((item) => item.id === roleId);
  if (!foundRole) return { ok: false, errorCode: ERROR_CODES.ROLE_NOT_FOUND };

  if (foundRole.status !== 'published' || foundRole.application?.enabled !== true || foundRole.contentReviewRequired === true) {
    return { ok: false, errorCode: ERROR_CODES.ROLE_NOT_OPEN };
  }

  if (!foundRole.title || !Object.prototype.hasOwnProperty.call(foundRole.title, locale)) {
    return { ok: false, errorCode: ERROR_CODES.VALIDATION_FAILED };
  }

  const privacyNoticeVersion = foundRole.application.privacyNoticeVersion;
  if (typeof privacyNoticeVersion !== 'string' || privacyNoticeVersion.trim() === '' || !safeEqual(privacyNoticeVersion, privacyVersion)) {
    return { ok: false, errorCode: ERROR_CODES.PRIVACY_VERSION_INVALID };
  }

  if (foundRole.application.deadlineUtc && Date.parse(foundRole.application.deadlineUtc) < now.getTime()) {
    return { ok: false, errorCode: ERROR_CODES.APPLICATION_DEADLINE_PASSED };
  }

  return { ok: true, role: foundRole };
}

function candidate(candidateInput, privacyAccepted) {
  const fields = [];
  if (!candidateInput || typeof candidateInput !== 'object' || Array.isArray(candidateInput)) {
    return { ok: false, errorCode: ERROR_CODES.VALIDATION_FAILED, fields: ['candidate'] };
  }

  for (const key of Object.keys(candidateInput)) {
    if (!CANDIDATE_FIELDS.has(key)) fields.push(key);
  }

  for (const key of REQUIRED_CANDIDATE_FIELDS) {
    if (typeof candidateInput[key] !== 'string' || !candidateInput[key].trim()) fields.push(key);
  }

  for (const key of OPTIONAL_TEXT_FIELDS) {
    if (candidateInput[key] != null && typeof candidateInput[key] !== 'string') fields.push(key);
  }

  for (const [key, limit] of Object.entries(LIMITS)) {
    if (key === 'originalName') continue;
    if (typeof candidateInput[key] === 'string' && candidateInput[key].length > limit) fields.push(key);
  }

  if (!validSingleLineText(candidateInput.fullName || '', LIMITS.fullName, true)) fields.push('fullName');
  if (!validSingleLineText(candidateInput.telephone || '', LIMITS.telephone)) fields.push('telephone');
  if (!validSingleLineText(candidateInput.currentLocation || '', LIMITS.currentLocation)) fields.push('currentLocation');
  if (!validMultilineText(candidateInput.coverNote || '', LIMITS.coverNote)) fields.push('coverNote');

  const email = normalizeEmail(candidateInput.email);
  if (!validEmail(email)) fields.push('email');

  if (!validLinkedInUrl(candidateInput.linkedinUrl || '')) fields.push('linkedinUrl');

  if (privacyAccepted !== true) fields.push('privacyAccepted');
  if (fields.length) return { ok: false, errorCode: ERROR_CODES.VALIDATION_FAILED, fields: [...new Set(fields)] };

  return {
    ok: true,
    candidate: {
      fullName: candidateInput.fullName.trim(),
      email,
      telephone: (candidateInput.telephone || '').trim(),
      currentLocation: (candidateInput.currentLocation || '').trim(),
      linkedinUrl: (candidateInput.linkedinUrl || '').trim(),
      coverNote: (candidateInput.coverNote || '').trim()
    }
  };
}

function request(input, now) {
  const fields = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) fields.push('request');
  if (typeof input?.source !== 'string') fields.push('source');
  if (typeof input?.clientSubmissionId !== 'string' || !UUID_RE.test(input.clientSubmissionId)) fields.push('clientSubmissionId');
  if (typeof input?.privacyNoticeVersion !== 'string' || !input.privacyNoticeVersion.trim()) fields.push('privacyNoticeVersion');
  if (!validIsoTimestamp(input?.submittedAtClientUtc, now)) fields.push('submittedAtClientUtc');
  return fields.length ? { ok: false, errorCode: ERROR_CODES.VALIDATION_FAILED, fields } : { ok: true };
}

function fileMeta(fileInput, cv) {
  if (!fileInput) return { ok: false, errorCode: ERROR_CODES.FILE_MISSING };
  if (typeof fileInput !== 'object' || Array.isArray(fileInput)) return { ok: false, errorCode: ERROR_CODES.VALIDATION_FAILED };
  if (!validOriginalFileName(fileInput.originalName)) {
    return { ok: false, errorCode: ERROR_CODES.VALIDATION_FAILED };
  }
  if (typeof fileInput.declaredMimeType !== 'string' || !Number.isInteger(fileInput.sizeBytes)) {
    return { ok: false, errorCode: ERROR_CODES.VALIDATION_FAILED };
  }

  const extension = ext(fileInput.originalName);
  if (!cv.allowedExtensions.includes(extension)) return { ok: false, errorCode: ERROR_CODES.FILE_TYPE_REJECTED };
  if (!cv.allowedMimeTypes.includes(fileInput.declaredMimeType)) return { ok: false, errorCode: ERROR_CODES.FILE_TYPE_REJECTED };
  if ((extension === '.pdf' && fileInput.declaredMimeType !== 'application/pdf') || (extension === '.docx' && fileInput.declaredMimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
    return { ok: false, errorCode: ERROR_CODES.FILE_TYPE_REJECTED };
  }
  if (fileInput.sizeBytes < 1 || fileInput.sizeBytes > cv.maxSizeBytes) return { ok: false, errorCode: ERROR_CODES.FILE_TOO_LARGE };
  return { ok: true, extension: extension.slice(1) };
}

module.exports = {
  LIMITS,
  BIDI_CONTROL_CHARACTERS,
  UNSAFE_SINGLE_LINE_CHARACTERS,
  UNSAFE_MULTILINE_CHARACTERS,
  UNSAFE_FILENAME_CHARACTERS,
  safeEqual,
  normalizeEmail,
  validEmail,
  validSingleLineText,
  validMultilineText,
  validLinkedInUrl,
  validOriginalFileName,
  validIsoTimestamp,
  role,
  candidate,
  request,
  fileMeta
};
