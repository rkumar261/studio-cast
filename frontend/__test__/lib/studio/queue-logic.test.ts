import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  reconcileTrackRecoveryItems,
  selectTrackSerializedBatch,
  trackExecutionKey,
} from '../../../src/lib/studio/queue-logic';

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

test('trackExecutionKey namespaces serialized work by recording and track', () => {
  assert.equal(trackExecutionKey({ recordingId: 'rec-9', trackId: 'track-z' }), 'rec-9:track-z');
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
        protocol: 'presigned_url',
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
        protocol: 'presigned_url',
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
        protocol: 'presigned_url',
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
        protocol: 'presigned_url',
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
        protocol: 'presigned_url',
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
        protocol: 'presigned_url',
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
        protocol: 'presigned_url',
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
        protocol: 'presigned_url',
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
    },
    now: 99,
  });

  assert.deepEqual(actions.deleteIds, []);
  assert.deepEqual(actions.upserts, []);
});
