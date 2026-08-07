'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const template = fs.readFileSync(
  path.join(root, 'infra/recruitment/monitoring-rules.v4.bicep'),
  'utf8'
);

const sourceFiles = [
  'services/recruitment-functions/src/functions/index.js',
  'services/recruitment-functions/src/retention/worker.js',
  'services/recruitment-functions/src/lib/scanDelivery.js',
  'services/recruitment-functions/src/flows/initiateApplication.js',
  'services/recruitment-functions/src/flows/finalizeApplication.js'
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');

const criticalEvents = [
  'recruitment_configuration_invalid',
  'recruitment_outbox_configuration_invalid',
  'recruitment_scan_event_rejected',
  'recruitment_scan_event_retry_requested',
  'recruitment_retention_configuration_invalid',
  'recruitment_retention_purge_failed',
  'recruitment_retention_idempotency_cleanup_failed',
  'finalization_outcome_reconciliation_failed',
  'initiate_abuse_controls_missing'
];

test('every monitored critical event is emitted by runtime code', () => {
  for (const event of criticalEvents) {
    assert.ok(sourceFiles.includes(event), `${event} is not emitted by runtime code`);
    assert.ok(template.includes(event), `${event} is not monitored by v4 rules`);
  }
});

test('alert queries use only workspace-based Application Insights tables', () => {
  assert.ok(template.includes("AppTraces\n| where Message has_any"));
  assert.ok(template.includes("AppRequests\n| where Name has \"recruitment\""));
  assert.ok(!template.includes('union '));
  assert.ok(!template.includes('\ntraces\n'));
  assert.ok(!template.includes('\nrequests\n'));
  assert.ok(!template.includes('timestamp'));
  assert.ok(!template.includes('column_ifexists'));
  assert.ok(!template.includes('coalesce('));
});

test('queries return raw matching rows for scheduled-query Count aggregation', () => {
  assert.ok(template.includes('| project TimeGenerated'));
  assert.ok(!template.includes('summarize FailureCount'));
  assert.equal((template.match(/timeAggregation: 'Count'/g) || []).length, 4);
  assert.ok(template.includes('threshold: 0'));
  assert.ok(template.includes('threshold: 5'));
  assert.ok(template.includes('threshold: 3'));
  assert.ok(template.includes('threshold: 20'));
});

test('security-response alert is recruitment-scoped and contains only status categories', () => {
  assert.ok(template.includes('var securityResponseSpikeQuery'));
  assert.ok(template.includes('toint(ResultCode) in (401, 403, 429)'));
  assert.ok(template.includes('Name has "recruitment" or Url has "/recruitment/"'));
  assert.ok(template.includes("name: 'recruitment-security-response-spike-v4'"));
  assert.ok(template.includes("windowSize: 'PT10M'"));
});

test('monitoring queries contain no candidate or document identifiers', () => {
  for (const forbidden of [
    'CandidateName',
    'CandidateEmail',
    'CandidateTelephone',
    'CoverNote',
    'OriginalFileName',
    'ApplicationReference',
    'FileReference',
    'QuarantineBlobPath',
    'CleanBlobPath'
  ]) {
    assert.ok(!template.includes(forbidden), `${forbidden} must not appear in monitoring v4`);
  }
});

test('alert creation remains explicit opt-in and action-group scoped', () => {
  assert.ok(template.includes('param enableAlerts bool = false'));
  assert.equal((template.match(/if \(enableAlerts\)/g) || []).length, 4);
  assert.ok(template.includes('actionGroupResourceId'));
  assert.ok(!template.includes('/subscriptions/'));
  assert.ok(!template.includes('@shorevest.com'));
});

test('v4 rule names are unique from superseded drafts', () => {
  assert.ok(template.includes("name: 'recruitment-critical-processing-failures-v4'"));
  assert.ok(template.includes("name: 'recruitment-repeated-api-failures-v4'"));
  assert.ok(template.includes("name: 'recruitment-readiness-unavailable-v4'"));
  assert.ok(template.includes("name: 'recruitment-security-response-spike-v4'"));
});

test('all alert rule IDs are returned only when alerts are enabled', () => {
  assert.ok(template.includes('output alertRuleIds array = enableAlerts ? ['));
  for (const resource of [
    'criticalProcessingFailures.id',
    'repeatedApiFailures.id',
    'readinessUnavailable.id',
    'securityResponseSpike.id'
  ]) {
    assert.ok(template.includes(resource));
  }
  assert.ok(template.includes('] : []'));
});
