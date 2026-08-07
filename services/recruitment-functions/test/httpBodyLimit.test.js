'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  declaredContentLength,
  encodedBodyAllowed,
  readJson
} = require('../src/lib/http');

function request({
  body = '{}',
  contentType = 'application/json',
  contentLength,
  contentEncoding,
  onRead
} = {}) {
  const values = {
    'content-type': contentType,
    'content-length': contentLength,
    'content-encoding': contentEncoding
  };
  return {
    headers: {
      get(name) {
        const value = values[name.toLowerCase()];
        return value == null ? null : String(value);
      }
    },
    async text() {
      onRead?.();
      return body;
    }
  };
}

const config = { maxBodyBytes: 16 };

test('declared content length is parsed conservatively', () => {
  assert.equal(declaredContentLength(request()), null);
  assert.equal(declaredContentLength(request({ contentLength: '16' })), 16);
  assert.equal(Number.isNaN(declaredContentLength(request({ contentLength: '-1' }))), true);
  assert.equal(Number.isNaN(declaredContentLength(request({ contentLength: '1.5' }))), true);
  assert.equal(Number.isNaN(declaredContentLength(request({ contentLength: '999999999999999999999' }))), true);
});

test('oversized declared bodies are rejected before req.text buffers them', async () => {
  let reads = 0;
  const result = await readJson(request({
    contentLength: '17',
    onRead: () => { reads += 1; }
  }), config);

  assert.equal(result.error.status, 413);
  assert.equal(result.error.body.errorCode, 'PAYLOAD_TOO_LARGE');
  assert.equal(reads, 0);
});

test('invalid declared lengths are rejected before body reads', async () => {
  let reads = 0;
  const result = await readJson(request({
    contentLength: 'not-a-number',
    onRead: () => { reads += 1; }
  }), config);

  assert.equal(result.error.status, 400);
  assert.equal(result.error.body.errorCode, 'VALIDATION_FAILED');
  assert.equal(reads, 0);
});

test('compressed JSON is rejected before decompression or body reads', async () => {
  let reads = 0;
  assert.equal(encodedBodyAllowed(request({ contentEncoding: '' })), true);
  assert.equal(encodedBodyAllowed(request({ contentEncoding: 'identity' })), true);
  assert.equal(encodedBodyAllowed(request({ contentEncoding: 'gzip' })), false);

  const result = await readJson(request({
    contentEncoding: 'gzip',
    onRead: () => { reads += 1; }
  }), config);
  assert.equal(result.error.status, 415);
  assert.equal(result.error.body.errorCode, 'UNSUPPORTED_CONTENT_ENCODING');
  assert.equal(reads, 0);
});

test('actual UTF-8 byte length remains authoritative when Content-Length is absent or understated', async () => {
  const multibyte = JSON.stringify({ value: '你你你你你' });
  assert.ok(Buffer.byteLength(multibyte) > multibyte.length);

  const absent = await readJson(request({ body: multibyte }), config);
  assert.equal(absent.error.status, 413);

  const understated = await readJson(request({
    body: multibyte,
    contentLength: '4'
  }), config);
  assert.equal(understated.error.status, 413);
});

test('valid bounded JSON is parsed once', async () => {
  let reads = 0;
  const body = JSON.stringify({ ok: true });
  const result = await readJson(request({
    body,
    contentLength: Buffer.byteLength(body),
    contentEncoding: 'identity',
    onRead: () => { reads += 1; }
  }), config);

  assert.deepEqual(result, { body: { ok: true } });
  assert.equal(reads, 1);
});
