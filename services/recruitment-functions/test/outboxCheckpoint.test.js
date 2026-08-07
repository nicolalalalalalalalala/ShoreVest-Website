'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createOutboxCheckpointStore } = require('../src/adapters/outboxCheckpoint');

function client(existing, options = {}) {
  const calls = [];
  return {
    calls,
    database() {
      return {
        container() {
          return {
            item(id, partitionKey) {
              return {
                async replace(body, requestOptions) {
                  calls.push({ id, partitionKey, body, requestOptions });
                  if (options.conflict) {
                    throw Object.assign(new Error('precondition failed'), { code: 412 });
                  }
                  return {
                    resource: {
                      ...body,
                      _etag: 'etag-2'
                    }
                  };
                }
              };
            }
          };
        }
      };
    },
    existing
  };
}

test('delivery checkpoint is written with the current outbox ETag', async () => {
  const fake = client();
  const store = createOutboxCheckpointStore({
    client: fake,
    databaseId: 'recruitment',
    now: () => new Date('2026-07-22T00:00:00.000Z')
  });
  const event = {
    id: 'outbox:CandidateAcknowledgementRequested:key',
    applicationReference: 'SV-APP-2026-ABC123',
    state: 'Processing',
    attemptCount: 1,
    _etag: 'etag-1',
    _rid: 'internal'
  };

  const updated = await store.checkpoint(event, {
    draftMessageId: 'immutable-draft-id'
  });

  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].requestOptions.accessCondition.condition, 'etag-1');
  assert.equal(fake.calls[0].body._rid, undefined);
  assert.equal(fake.calls[0].body.deliveryCheckpoint.draftMessageId, 'immutable-draft-id');
  assert.equal(updated._etag, 'etag-2');
});

test('checkpoint conflict is retryable and never overwrites another worker', async () => {
  const fake = client(null, { conflict: true });
  const store = createOutboxCheckpointStore({ client: fake, databaseId: 'recruitment' });

  await assert.rejects(
    () => store.checkpoint({
      id: 'outbox:CandidateAcknowledgementRequested:key',
      applicationReference: 'SV-APP-2026-ABC123',
      state: 'Processing',
      _etag: 'stale-etag'
    }, { draftMessageId: 'draft-id' }),
    (error) => error.code === 'OUTBOX_CHECKPOINT_CONFLICT' && error.permanent !== true
  );
});

test('checkpoint requires a leased event identity and ETag', async () => {
  const store = createOutboxCheckpointStore({ client: client(), databaseId: 'recruitment' });
  await assert.rejects(
    () => store.checkpoint({ applicationReference: 'APP-1' }, { draftMessageId: 'draft-id' }),
    (error) => error.code === 'OUTBOX_CHECKPOINT_INVALID' && error.permanent === true
  );
});
