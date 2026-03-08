import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileTrackRecoveryItems,
  selectTrackSerializedBatch,
  selectTusResumeCandidate,
} from './queue-logic';

test('queue scheduler never selects same-track chunks concurrently', () => {
  const selected = selectTrackSerializedBatch({
    items: [
      {
        id: 'a-1',
        recordingId: 'rec-1',
        trackId: 'track-a',
        seq: 1,
        status: 'queued',
        nextAttemptAt: 0,
        createdAt: 1,
      },
      {
        id: 'a-2',
        recordingId: 'rec-1',
        trackId: 'track-a',
        seq: 2,
        status: 'queued',
        nextAttemptAt: 0,
        createdAt: 2,
      },
      {
        id: 'b-1',
        recordingId: 'rec-1',
        trackId: 'track-b',
        seq: 1,
        status: 'queued',
        nextAttemptAt: 0,
        createdAt: 3,
      },
    ],
    now: 1,
    concurrency: 2,
    inFlightItemIds: new Set<string>(),
    inFlightTrackKeys: new Set<string>(),
  });

  assert.deepEqual(
    selected.map((item) => item.id),
    ['a-1', 'b-1']
  );
});

test('reconcile keeps seq > highestExisting and requeues failed incomplete chunks', () => {
  const actions = reconcileTrackRecoveryItems({
    items: [
      {
        id: 'seq-1',
        recordingId: 'rec-1',
        trackId: 'track-a',
        seq: 1,
        status: 'queued',
        protocol: 'tus',
        nextAttemptAt: 10,
        createdAt: 1,
        updatedAt: 10,
      },
      {
        id: 'seq-4',
        recordingId: 'rec-1',
        trackId: 'track-a',
        seq: 4,
        status: 'failed',
        protocol: 'tus',
        nextAttemptAt: Number.MAX_SAFE_INTEGER,
        createdAt: 4,
        updatedAt: 10,
      },
      {
        id: 'seq-5',
        recordingId: 'rec-1',
        trackId: 'track-a',
        seq: 5,
        status: 'failed',
        protocol: 'tus',
        nextAttemptAt: Number.MAX_SAFE_INTEGER,
        createdAt: 5,
        updatedAt: 10,
      },
      {
        id: 'seq-6',
        recordingId: 'rec-1',
        trackId: 'track-a',
        seq: 6,
        status: 'queued',
        protocol: 'tus',
        nextAttemptAt: 10,
        createdAt: 6,
        updatedAt: 10,
      },
    ],
    inFlightItemIds: new Set<string>(),
    snapshot: {
      recordingId: 'rec-1',
      trackId: 'track-a',
      highestExistingSeq: 5,
      highestContiguousUploadedSeq: 3,
    },
    now: 99,
  });

  assert.deepEqual(actions.deleteIds, ['seq-1']);
  assert.deepEqual(
    actions.upserts.map((item) => ({ id: item.id, status: item.status, nextAttemptAt: item.nextAttemptAt })),
    [
      { id: 'seq-4', status: 'queued', nextAttemptAt: 99 },
      { id: 'seq-5', status: 'queued', nextAttemptAt: 99 },
    ]
  );
  assert.ok(!actions.upserts.some((item) => item.id === 'seq-6'));
});

test('TUS retry picks canonical resumable identity before creating fresh upload', () => {
  const byItemUrl = selectTusResumeCandidate({
    itemTusUrl: 'http://localhost:1080/tus/item-url',
    endpoint: 'http://localhost:1080/tus/',
    buildTusUrlFromId: (id, endpoint) => `${endpoint}${id}`,
  });
  assert.equal(byItemUrl, 'http://localhost:1080/tus/item-url');

  const byResumePlan = selectTusResumeCandidate({
    resumePlanTusResourceUrl: 'http://localhost:1080/tus/plan-url',
    endpoint: 'http://localhost:1080/tus/',
    buildTusUrlFromId: (id, endpoint) => `${endpoint}${id}`,
  });
  assert.equal(byResumePlan, 'http://localhost:1080/tus/plan-url');

  const byId = selectTusResumeCandidate({
    itemTusId: 'canonical-id',
    endpoint: 'http://localhost:1080/tus/',
    buildTusUrlFromId: (id, endpoint) => `${endpoint}${id}`,
  });
  assert.equal(byId, 'http://localhost:1080/tus/canonical-id');
});
