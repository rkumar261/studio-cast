import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma.js';
import { maybeEnqueueStitchJobsForRecording } from './recording-pipeline.service.js';

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
