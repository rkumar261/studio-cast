import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma.js';
import { finalizeTrackCaptureService } from '../../src/services/track-finalization.service.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

test('finalize persists final_seq and finalization timestamps', async () => {
  const restores: Array<() => void> = [];
  let updateArgs: any = null;
  const captureClosedAt = '2026-03-09T10:00:00.000Z';

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        (async () => ({
          id: 'rec-1',
          userId: 'owner-1',
          status: 'uploading',
          stopped_at: null,
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track,
        'findUnique',
        (async () => ({
          id: 'track-1',
          recording_id: 'rec-1',
          participant_id: 'participant-1',
          final_seq: null,
          capture_closed_at: null,
          finalized_at: null,
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track,
        'update',
        (async (args: any) => {
          updateArgs = args;
          return {
            id: 'track-1',
            recording_id: 'rec-1',
            final_seq: args.data.final_seq,
            capture_closed_at: args.data.capture_closed_at,
            finalized_at: args.data.finalized_at,
            finalize_requested_at: args.data.finalize_requested_at,
          };
        })
      )
    );

    const result = await finalizeTrackCaptureService({
      recordingId: 'rec-1',
      trackId: 'track-1',
      principal: { kind: 'user', userId: 'owner-1' },
      body: {
        finalSeq: 3,
        captureClosedAt,
      },
    });

    assert.equal(result.code, 'ok');
    assert.equal(result.data.track.finalSeq, 3);
    assert.equal(result.data.track.captureClosedAt, captureClosedAt);
    assert.ok(result.data.track.finalizeRequestedAt);

    assert.equal(updateArgs.data.final_seq, 3);
    assert.equal(updateArgs.data.capture_closed_at.toISOString(), captureClosedAt);
    assert.ok(updateArgs.data.finalized_at instanceof Date);
    assert.ok(updateArgs.data.finalize_requested_at instanceof Date);
    assert.equal(updateArgs.data.lifecycle_state, 'finalized');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('finalize keeps final seq and finalized_at monotonic on repeat finalize', async () => {
  const restores: Array<() => void> = [];
  let updateArgs: any = null;
  const existingCaptureClosedAt = new Date('2026-03-09T10:00:00.000Z');
  const existingFinalizedAt = new Date('2026-03-09T10:00:05.000Z');

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        (async () => ({
          id: 'rec-1',
          userId: 'owner-1',
          status: 'uploading',
          stopped_at: null,
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track,
        'findUnique',
        (async () => ({
          id: 'track-1',
          recording_id: 'rec-1',
          participant_id: 'participant-1',
          final_seq: 5,
          capture_closed_at: existingCaptureClosedAt,
          finalized_at: existingFinalizedAt,
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track,
        'update',
        (async (args: any) => {
          updateArgs = args;
          return {
            id: 'track-1',
            recording_id: 'rec-1',
            final_seq: args.data.final_seq,
            capture_closed_at: args.data.capture_closed_at,
            finalized_at: args.data.finalized_at,
            finalize_requested_at: args.data.finalize_requested_at,
          };
        })
      )
    );

    const result = await finalizeTrackCaptureService({
      recordingId: 'rec-1',
      trackId: 'track-1',
      principal: { kind: 'user', userId: 'owner-1' },
      body: {
        finalSeq: 2,
        captureClosedAt: '2026-03-09T10:01:00.000Z',
      },
    });

    assert.equal(result.code, 'ok');
    assert.equal(result.data.track.finalSeq, 5);
    assert.equal(result.data.track.captureClosedAt, existingCaptureClosedAt.toISOString());

    assert.equal(updateArgs.data.final_seq, 5);
    assert.equal(updateArgs.data.capture_closed_at.toISOString(), existingCaptureClosedAt.toISOString());
    assert.equal(updateArgs.data.finalized_at.toISOString(), existingFinalizedAt.toISOString());
    assert.ok(updateArgs.data.finalize_requested_at instanceof Date);
    assert.equal(updateArgs.data.lifecycle_state, 'finalized');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('finalize rejects invalid final sequence', async () => {
  const negative = await finalizeTrackCaptureService({
    recordingId: 'rec-1',
    trackId: 'track-1',
    principal: { kind: 'user', userId: 'owner-1' },
    body: {
      finalSeq: -1,
    },
  });
  assert.equal(negative.code, 'invalid_final_seq');

  const nonInteger = await finalizeTrackCaptureService({
    recordingId: 'rec-1',
    trackId: 'track-1',
    principal: { kind: 'user', userId: 'owner-1' },
    body: {
      finalSeq: 1.2 as unknown as number,
    },
  });
  assert.equal(nonInteger.code, 'invalid_final_seq');
});
