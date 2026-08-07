'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const template = fs.readFileSync(
  path.resolve(__dirname, '../../../infra/recruitment/event-grid-subscription.bicep'),
  'utf8'
);

test('Defender scan results route only to the Azure Function handler', () => {
  assert.ok(template.includes("endpointType: 'AzureFunction'"));
  assert.ok(template.includes("resourceId: '${functionApp.id}/functions/${functionName}'"));
  assert.ok(template.includes("'Microsoft.Security.MalwareScanningResult'"));
  assert.ok(!template.includes("endpointType: 'WebHook'"));
});

test('Event Grid delivery uses bounded retries and one event per invocation', () => {
  assert.ok(template.includes('maxEventsPerBatch: 1'));
  assert.ok(template.includes('maxDeliveryAttempts: maxDeliveryAttempts'));
  assert.ok(template.includes('eventTimeToLiveInMinutes: eventTimeToLiveInMinutes'));
  assert.ok(template.includes("eventDeliverySchema: 'EventGridSchema'"));
});

test('subscription is deliberately post-deployment against existing resources', () => {
  assert.ok(template.includes("resource topic 'Microsoft.EventGrid/topics@2023-12-15-preview' existing"));
  assert.ok(template.includes("resource functionApp 'Microsoft.Web/sites@2024-04-01' existing"));
});
