'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { requestContext } = require('../src/lib/http');

function request(headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    headers: {
      get(name) {
        return normalized[name.toLowerCase()] || null;
      }
    }
  };
}

test('forwarded-for provides a bounded client identity when it is the only proxy address', () => {
  const context = requestContext(request({
    'x-forwarded-for': '198.51.100.21, 10.0.0.4',
    'user-agent': 'Browser/1.0'
  }));

  assert.equal(context.clientIp, '198.51.100.21');
});

test('platform client IP takes precedence over forwarded proxy headers', () => {
  const context = requestContext(request({
    'x-client-ip': '203.0.113.10',
    'x-forwarded-for': '198.51.100.21, 10.0.0.4'
  }));

  assert.equal(context.clientIp, '203.0.113.10');
});

test('conflicting untrusted proxy address headers fall back to the conservative shared bucket', () => {
  const context = requestContext(request({
    'x-forwarded-for': '198.51.100.21',
    'cf-connecting-ip': '192.0.2.45'
  }));

  assert.equal(context.clientIp, '');
});
