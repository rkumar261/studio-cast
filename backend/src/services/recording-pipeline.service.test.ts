import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma.js';
import {
  maybeEnqueueStitchJobsForRecording,
  maybeMarkRecordingProcessing,
} from './recording-pipeline.service.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

type TrackShape = {
  id: string;
  final_seq: number | null;
  capture_closed_at: Date | null;
  storage_key_raw: string | null;
  track_chunk: Array<{ seq: number; state: string; storage_key_raw: string | null }>;
};

function finalizedTrack(input: {
  id: string;
  finalSeq: number;
  chunks: Array<{ seq: number; state: string; storageKeyRaw?: string | null }>;
}): TrackShape {
  return {
    id: input.id,
    final_seq: input.finalSeq,
    capture_closed_at: new Date(),
    storage_key_raw: null,
    track_chunk: input.chunks.map((chunk) => ({
      seq: chunk.seq,
      state: chunk.state,
      storage_key_raw: chunk.storageKeyRaw ?? `recordings/rec-1/tracks/${input.id}/chunks/${chunk.seq}.webm`,
    })),
  };
}

function unfinalizedTrack(input: {
  id: string;
  chunks: Array<{ seq: number; state: string; storageKeyRaw?: string | null }>;
}): TrackShape {
  return {
    id: input.id,
    final_seq: null,
    capture_closed_at: null,
    storage_key_raw: null,
    track_chunk: input.chunks.map((chunk) => ({
      seq: chunk.seq,
      state: chunk.state,
      storage_key_raw: chunk.storageKeyRaw ?? `recordings/rec-1/tracks/${input.id}/chunks/${chunk.seq}.webm`,
    })),
  };
}

test('finalized track stitches only after chunks 1..finalSeq are uploaded', async () => {
  const restores: Array<() => void> = [];
  const jobs: any[] = [];
  let tracks: TrackShape[] = [
    finalizedTrack({
      id: 'track-1',
      finalSeq: 2,
      chunks: [{ seq: 1, state: 'uploaded' }],
    }),
  ];

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        (async () => ({
          id: 'rec-1',
          status: 'uploading',
          stopped_at: new Date(),
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track,
        'findMany',
        (async () => tracks)
      )
    );
    restores.push(
      stubMethod(
        prisma.job,
        'findMany',
        (async () => jobs)
      )
    );
    restores.push(
      stubMethod(
        prisma.job,
        'create',
        (async (args: any) => {
          const created = {
            id: `job-${jobs.length + 1}`,
            recording_id: args.data.recording_id,
            type: args.data.type,
            payload_json: args.data.payload_json,
            state: 'queued',
            created_at: new Date(),
          };
          jobs.push(created);
          return created as any;
        })
      )
    );

    const before = await maybeEnqueueStitchJobsForRecording('rec-1');
    assert.deepEqual(before.queuedTrackIds, []);

    tracks = [
      finalizedTrack({
        id: 'track-1',
        finalSeq: 2,
        chunks: [
          { seq: 1, state: 'uploaded' },
          { seq: 2, state: 'uploaded' },
        ],
      }),
    ];

    const after = await maybeEnqueueStitchJobsForRecording('rec-1');
    assert.deepEqual(after.queuedTrackIds, ['track-1']);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('non-finalized track is not stitch-ready even when chunks exist', async () => {
  const restores: Array<() => void> = [];
  const jobs: any[] = [];
  const tracks: TrackShape[] = [
    unfinalizedTrack({
      id: 'track-open',
      chunks: [
        { seq: 1, state: 'uploaded' },
        { seq: 2, state: 'uploaded' },
      ],
    }),
  ];

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        (async () => ({
          id: 'rec-1',
          status: 'uploading',
          stopped_at: new Date(),
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track,
        'findMany',
        (async () => tracks)
      )
    );
    restores.push(stubMethod(prisma.job, 'findMany', async () => jobs));
    restores.push(stubMethod(prisma.job, 'create', async () => ({} as any)));

    const result = await maybeEnqueueStitchJobsForRecording('rec-1');
    assert.deepEqual(result.queuedTrackIds, []);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('gap [1,3] blocks stitch', async () => {
  const restores: Array<() => void> = [];
  const jobs: any[] = [];
  const tracks: TrackShape[] = [
    finalizedTrack({
      id: 'track-gap',
      finalSeq: 3,
      chunks: [
        { seq: 1, state: 'uploaded' },
        { seq: 3, state: 'uploaded' },
      ],
    }),
  ];

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        (async () => ({
          id: 'rec-1',
          status: 'uploading',
          stopped_at: new Date(),
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track,
        'findMany',
        (async () => tracks)
      )
    );
    restores.push(
      stubMethod(prisma.job, 'findMany', async () => jobs)
    );
    restores.push(
      stubMethod(prisma.job, 'create', async () => ({} as any))
    );

    const result = await maybeEnqueueStitchJobsForRecording('rec-1');
    assert.deepEqual(result.queuedTrackIds, []);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('stop before late final chunk does not enqueue early stitch', async () => {
  const restores: Array<() => void> = [];
  const jobs: any[] = [];
  const tracks: TrackShape[] = [
    finalizedTrack({
      id: 'track-late',
      finalSeq: 2,
      chunks: [
        { seq: 1, state: 'uploaded' },
        { seq: 2, state: 'uploading' },
      ],
    }),
  ];

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        (async () => ({
          id: 'rec-1',
          status: 'uploading',
          stopped_at: new Date(),
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track,
        'findMany',
        (async () => tracks)
      )
    );
    restores.push(
      stubMethod(prisma.job, 'findMany', async () => jobs)
    );
    restores.push(
      stubMethod(prisma.job, 'create', async () => ({} as any))
    );

    const result = await maybeEnqueueStitchJobsForRecording('rec-1');
    assert.deepEqual(result.queuedTrackIds, []);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('recording upload completion is captured before processing starts', async () => {
  const restores: Array<() => void> = [];
  const updates: any[] = [];
  const tracks: TrackShape[] = [
    {
      ...finalizedTrack({
        id: 'track-1',
        finalSeq: 1,
        chunks: [{ seq: 1, state: 'uploaded' }],
      }),
      storage_key_raw: 'recordings/rec-1/tracks/track-1/raw.webm',
    },
  ];

  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => ({
        id: 'rec-1',
        status: 'uploading',
        lifecycle_state: 'post_stop_uploading',
        stopped_at: new Date('2026-03-15T04:00:00.000Z'),
        upload_completed_at: null,
        processing_started_at: null,
      }))
    );
    restores.push(
      stubMethod(prisma.track, 'findMany', async () => tracks)
    );
    restores.push(
      stubMethod(prisma.recording, 'update', async (args: any) => {
        updates.push(args);
        return {} as any;
      })
    );

    const result = await maybeMarkRecordingProcessing('rec-1');

    assert.equal(result.updated, true);
    assert.equal(updates.length, 2);
    assert.equal(updates[0].data.lifecycle_state, 'upload_complete');
    assert.ok(updates[0].data.upload_completed_at instanceof Date);
    assert.equal(updates[1].data.lifecycle_state, 'processing');
    assert.ok(updates[1].data.processing_started_at instanceof Date);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
