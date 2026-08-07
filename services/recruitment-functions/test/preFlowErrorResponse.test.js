'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/functions/index.js'),
  'utf8'
);

test('pre-flow validation failures use Azure Functions jsonBody responses', () => {
  assert.equal(
    (source.match(/jsonBody: parsed\.error\.body/g) || []).length,
    2
  );
  assert.ok(!source.includes('{ ...parsed.error, headers: withCors(req, config) }'));
});
