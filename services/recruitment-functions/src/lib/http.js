'use strict';

const net = require('net');

const SAFE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'"
};

function header(req, name) {
  return req.headers && typeof req.headers.get === 'function'
    ? req.headers.get(name)
    : req.headers?.[name] || req.headers?.[name.toLowerCase()];
}

function originAllowed(req, config) {
  const origin = header(req, 'origin');
  if (!origin) return config.requireOrigin !== true;
  return config.allowedOrigins.includes(origin);
}

function withCors(req, config, extra = {}) {
  const origin = header(req, 'origin');
  return {
    ...SAFE_HEADERS,
    ...(origin && config.allowedOrigins.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : {}),
    ...extra
  };
}

function preflightResponse(req, config) {
  if (!originAllowed(req, config)) {
    return {
      status: 403,
      headers: withCors(req, config),
      jsonBody: { success: false, errorCode: 'FORBIDDEN' }
    };
  }

  const requestedMethod = String(header(req, 'access-control-request-method') || '')
    .trim()
    .toUpperCase();
  const corsHeaders = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
  };

  if (requestedMethod !== 'POST') {
    return {
      status: 405,
      headers: withCors(req, config, corsHeaders),
      jsonBody: { success: false, errorCode: 'METHOD_NOT_ALLOWED' }
    };
  }

  const requestedHeaders = String(header(req, 'access-control-request-headers') || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (requestedHeaders.some((value) => value !== 'content-type')) {
    return {
      status: 403,
      headers: withCors(req, config, corsHeaders),
      jsonBody: { success: false, errorCode: 'FORBIDDEN' }
    };
  }

  return {
    status: 204,
    headers: withCors(req, config, corsHeaders)
  };
}

function declaredContentLength(req) {
  const raw = header(req, 'content-length');
  if (raw == null || String(raw).trim() === '') return null;
  const normalized = String(raw).trim();
  if (!/^(0|[1-9]\d*)$/.test(normalized)) return Number.NaN;
  const value = Number(normalized);
  return Number.isSafeInteger(value) && value >= 0 ? value : Number.NaN;
}

function encodedBodyAllowed(req) {
  const raw = header(req, 'content-encoding');
  if (raw == null || String(raw).trim() === '') return true;
  return String(raw).trim().toLowerCase() === 'identity';
}

async function readJson(req, config) {
  const contentType = header(req, 'content-type') || '';
  if (!/^application\/json\b/i.test(contentType)) {
    return { error: { status: 415, body: { success: false, errorCode: 'UNSUPPORTED_MEDIA_TYPE' } } };
  }

  if (!encodedBodyAllowed(req)) {
    return { error: { status: 415, body: { success: false, errorCode: 'UNSUPPORTED_CONTENT_ENCODING' } } };
  }

  const declaredLength = declaredContentLength(req);
  if (Number.isNaN(declaredLength)) {
    return { error: { status: 400, body: { success: false, errorCode: 'VALIDATION_FAILED' } } };
  }
  if (declaredLength !== null && declaredLength > config.maxBodyBytes) {
    return { error: { status: 413, body: { success: false, errorCode: 'PAYLOAD_TOO_LARGE' } } };
  }

  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > config.maxBodyBytes) {
    return { error: { status: 413, body: { success: false, errorCode: 'PAYLOAD_TOO_LARGE' } } };
  }

  try {
    return { body: JSON.parse(text) };
  } catch (_) {
    return { error: { status: 400, body: { success: false, errorCode: 'VALIDATION_FAILED' } } };
  }
}

function normalizeAppServiceClientIp(value) {
  if (typeof value !== 'string') return '';
  const candidate = value.split(',')[0].trim().slice(0, 128);
  if (net.isIP(candidate)) return candidate;

  const bracketed = candidate.match(/^\[([^\]]+)\](?::\d{1,5})?$/);
  if (bracketed && net.isIP(bracketed[1])) return bracketed[1];

  const ipv4WithPort = candidate.match(/^([^:]+):(\d{1,5})$/);
  if (ipv4WithPort && net.isIP(ipv4WithPort[1]) === 4) return ipv4WithPort[1];
  return '';
}

function requestContext(req) {
  const platformClientIp = header(req, 'x-client-ip') || header(req, 'client-ip') || '';
  const forwardedFor = header(req, 'x-forwarded-for') || '';
  const competingProxyIp = header(req, 'cf-connecting-ip') || '';
  const networkIdentifier = platformClientIp || (forwardedFor && !competingProxyIp ? forwardedFor : '');
  const clientIp = normalizeAppServiceClientIp(networkIdentifier);
  const userAgent = String(header(req, 'user-agent') || '').slice(0, 512);
  return { clientIp, userAgent };
}

function candidate(result) {
  if (!result || result.success !== true) return result;
  const response = { success: true };
  for (const key of [
    'alreadySubmitted',
    'alreadyFinalized',
    'applicationReference',
    'fileReference',
    'applicationStatus',
    'fileStatus',
    'status',
    'retryAfterMs',
    'completionToken',
    'finalizationToken',
    'upload'
  ]) {
    if (result[key] !== undefined) response[key] = result[key];
  }
  return response;
}

function unavailable(req, config) {
  return {
    status: 503,
    headers: withCors(req, config, { 'Retry-After': '3600' }),
    jsonBody: { success: false, errorCode: 'SERVICE_UNAVAILABLE' }
  };
}

module.exports = {
  header,
  originAllowed,
  withCors,
  preflightResponse,
  declaredContentLength,
  encodedBodyAllowed,
  readJson,
  normalizeAppServiceClientIp,
  requestContext,
  candidate,
  unavailable
};
