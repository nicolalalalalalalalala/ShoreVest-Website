'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const template = fs.readFileSync(
  path.resolve(__dirname, '../../../infra/recruitment/candidate-upload-cors.bicep'),
  'utf8'
);

test('candidate upload CORS has exact ShoreVest origins and no wildcard', () => {
  assert.ok(template.includes("'https://shorevest.com'"));
  assert.ok(template.includes("'https://www.shorevest.com'"));
  assert.ok(!template.includes("allowedOrigins: ['*']"));
  assert.ok(!template.includes("'http://"));
});

test('candidate upload CORS permits write preflight only', () => {
  assert.ok(template.includes("'OPTIONS'"));
  assert.ok(template.includes("'PUT'"));
  for (const method of ["'GET'", "'POST'", "'DELETE'", "'PATCH'"]) {
    assert.ok(!template.includes(method));
  }
});

test('candidate upload CORS exposes no reusable authorization material', () => {
  assert.ok(template.includes("'content-type'"));
  assert.ok(template.includes("'x-ms-*'"));
  assert.ok(template.includes("'etag'"));
  assert.ok(!/authorization/i.test(template));
  assert.ok(!/sas/i.test(template));
  assert.ok(!/accountkey/i.test(template));
});
