'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { NOTIFICATION_EVENTS: EVENTS } = require('../../../api/recruitment/core/constants');
const {
  FINALIZATION_GATED_EVENTS,
  createFinalizationGatedDispatcher
} = require('../src/outbox/finalizationGate');

function dependencies(application) {
  return {
    applicationStore: {
      async getApplication() {
        return application;
      }
    }
  };
}

test('scan outcome events stay retryable until candidate finalization', async () => {
  for (const type of FINALIZATION_GATED_EVENTS) {
    let deliveries = 0;
    const dispatcher = createFinalizationGatedDispatcher({
      async deliver() {
        deliveries += 1;
        return { deliveryReference: 'unexpected' };
      }
    });

    await assert.rejects(
      () => dispatcher.deliver({
        type,
        applicationReference: 'SV-APP-2026-ABC123'
      }, dependencies({
        applicationReference: 'SV-APP-2026-ABC123',
        finalizedAtUtc: null,
        candidateSubmissionStatus: 'Draft'
      })),
      (error) => error.code === 'APPLICATION_NOT_FINALIZED' &&
        error.permanent === false &&
        error.retryable === true
    );
    assert.equal(deliveries, 0);
  }
});

test('finalized outcome events reach the underlying dispatcher', async () => {
  const delivered = [];
  const dispatcher = createFinalizationGatedDispatcher({
    async deliver(event) {
      delivered.push(event);
      return { deliveryReference: 'application:1' };
    }
  });
  const event = {
    type: EVENTS.DocumentsReady,
    applicationReference: 'SV-APP-2026-ABC123'
  };

  assert.deepEqual(await dispatcher.deliver(event, dependencies({
    applicationReference: 'SV-APP-2026-ABC123',
    finalizedAtUtc: '2026-07-23T00:00:00.000Z',
    candidateSubmissionStatus: 'Submitted'
  })), { deliveryReference: 'application:1' });
  assert.deepEqual(delivered, [event]);
});

test('non-outcome events are passed through without an extra application read', async () => {
  let applicationReads = 0;
  let deliveries = 0;
  const dispatcher = createFinalizationGatedDispatcher({
    async deliver() {
      deliveries += 1;
      return { deliveryReference: 'mail:1' };
    }
  });

  const result = await dispatcher.deliver({
    type: EVENTS.CandidateAcknowledgementRequested,
    applicationReference: 'SV-APP-2026-ABC123'
  }, {
    applicationStore: {
      async getApplication() {
        applicationReads += 1;
        return null;
      }
    }
  });

  assert.deepEqual(result, { deliveryReference: 'mail:1' });
  assert.equal(applicationReads, 0);
  assert.equal(deliveries, 1);
});

test('dispatcher construction fails closed without a delivery implementation', () => {
  assert.throws(() => createFinalizationGatedDispatcher({}), /outbox dispatcher/);
});
