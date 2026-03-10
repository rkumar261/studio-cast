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

test('queue scheduler skips tracks that already have an in-flight item', () => {
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
    inFlightItemIds: new Set<string>(['a-1']),
    inFlightTrackKeys: new Set<string>(['rec-1:track-a']),
  });

  assert.deepEqual(
    selected.map((item) => item.id),
    ['b-1']
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

test('reconcile requeues stale processing items and preserves future local chunks', () => {
  const actions = reconcileTrackRecoveryItems({
    items: [
      {
        id: 'seq-2',
        recordingId: 'rec-1',
        trackId: 'track-a',
        seq: 2,
        status: 'processing',
        protocol: 'tus',
        nextAttemptAt: 10,
        createdAt: 2,
        updatedAt: 10,
      },
      {
        id: 'seq-4',
        recordingId: 'rec-1',
        trackId: 'track-a',
        seq: 4,
        status: 'processing',
        protocol: 'tus',
        nextAttemptAt: 10,
        createdAt: 4,
        updatedAt: 10,
      },
      {
        id: 'seq-7',
        recordingId: 'rec-1',
        trackId: 'track-a',
        seq: 7,
        status: 'processing',
        protocol: 'tus',
        nextAttemptAt: 10,
        createdAt: 7,
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
    now: 123,
  });

  assert.deepEqual(actions.deleteIds, ['seq-2']);
  assert.deepEqual(
    actions.upserts.map((item) => ({ id: item.id, status: item.status, nextAttemptAt: item.nextAttemptAt })),
    [
      { id: 'seq-4', status: 'queued', nextAttemptAt: 123 },
      { id: 'seq-7', status: 'queued', nextAttemptAt: 123 },
    ]
  );
});

test('reconcile applies resumable TUS metadata when server provides it', () => {
  const actions = reconcileTrackRecoveryItems({
    items: [
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
    ],
    inFlightItemIds: new Set<string>(),
    snapshot: {
      recordingId: 'rec-1',
      trackId: 'track-a',
      highestExistingSeq: 5,
      highestContiguousUploadedSeq: 4,
      resumableTus: {
        chunkId: 'chunk-5',
        seq: 5,
        tusId: 'tus-5',
        tusUrl: 'http://localhost:1080/tus/tus-5',
        tusUploadState: 'uploading',
      },
    },
    now: 99,
  });

  assert.equal(actions.deleteIds.length, 0);
  assert.deepEqual(actions.upserts, [
    {
      id: 'seq-5',
      recordingId: 'rec-1',
      trackId: 'track-a',
      seq: 5,
      status: 'queued',
      protocol: 'tus',
      nextAttemptAt: 99,
      createdAt: 5,
      updatedAt: 99,
      resumableTusId: 'tus-5',
      resumableTusUrl: 'http://localhost:1080/tus/tus-5',
      resumableTusChunkId: 'chunk-5',
      resumableTusUploadState: 'uploading',
    },
  ]);
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

test('offline retry backoff prevents immediate re-dispatch before reconnect window', () => {
  const items = [
    {
      id: 'offline-1',
      recordingId: 'rec-1',
      trackId: 'track-a',
      seq: 1,
      status: 'failed' as const,
      nextAttemptAt: 5_000,
      createdAt: 1,
    },
  ];

  const beforeReconnect = selectTrackSerializedBatch({
    items,
    now: 4_999,
    concurrency: 1,
    inFlightItemIds: new Set<string>(),
    inFlightTrackKeys: new Set<string>(),
  });
  assert.deepEqual(beforeReconnect, []);

  const afterReconnect = selectTrackSerializedBatch({
    items,
    now: 5_000,
    concurrency: 1,
    inFlightItemIds: new Set<string>(),
    inFlightTrackKeys: new Set<string>(),
  });
  assert.deepEqual(afterReconnect.map((item) => item.id), ['offline-1']);
});

test('recovery reconcile does not mutate items still marked in-flight on reconnect', () => {
  const actions = reconcileTrackRecoveryItems({
    items: [
      {
        id: 'seq-5',
        recordingId: 'rec-1',
        trackId: 'track-a',
        seq: 5,
        status: 'processing',
        protocol: 'tus',
        nextAttemptAt: 10,
        createdAt: 5,
        updatedAt: 10,
      },
    ],
    inFlightItemIds: new Set<string>(['seq-5']),
    snapshot: {
      recordingId: 'rec-1',
      trackId: 'track-a',
      highestExistingSeq: 5,
      highestContiguousUploadedSeq: 3,
      resumableTus: {
        chunkId: 'chunk-5',
        seq: 5,
        tusId: 'tus-5',
        tusUrl: 'http://localhost:1080/tus/tus-5',
      },
    },
    now: 99,
  });

  assert.deepEqual(actions.deleteIds, []);
  assert.deepEqual(actions.upserts, []);
});
