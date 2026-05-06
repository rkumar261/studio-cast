import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma.js';
import {
  listParticipantAssetsForRecording,
  markParticipantAssetFailed,
  markParticipantAssetProcessing,
  markParticipantAssetReady,
  reconcileParticipantMasterAsset,
  selectParticipantMasterTrack,
} from '../../src/services/participant-asset.service.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

test('participant asset ready upsert stores preview, metadata, and export set', async () => {
  const restores: Array<() => void> = [];
  let upsertArgs: any = null;

  try {
    restores.push(
      stubMethod(
        prisma.participant_asset,
        'upsert',
        (async (args: any) => {
          upsertArgs = args;
          return {
            id: 'asset-1',
          };
        })
      )
    );

    await markParticipantAssetReady({
      recordingId: 'rec-1',
      participantId: 'part-1',
      storageKey: 'recordings/rec-1/tracks/t1/final/video.mp4',
      previewKey: 'recordings/rec-1/tracks/t1/final/video.mp4',
      durationMs: 1234,
      resolution: '1280x720',
      metadata: {
        sourceTrackId: 'track-1',
        sourceKind: 'video',
      },
      exportSet: ['mp4'],
    });

    assert.deepEqual(upsertArgs.where.recording_id_participant_id, {
      recording_id: 'rec-1',
      participant_id: 'part-1',
    });
    assert.equal(upsertArgs.create.state, 'ready');
    assert.equal(upsertArgs.create.preview_key, 'recordings/rec-1/tracks/t1/final/video.mp4');
    assert.deepEqual(upsertArgs.create.metadata_json, {
      sourceTrackId: 'track-1',
      sourceKind: 'video',
    });
    assert.deepEqual(upsertArgs.create.export_set_json, ['mp4']);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('participant asset processing/failed transitions are explicit', async () => {
  const restores: Array<() => void> = [];
  const states: string[] = [];

  try {
    restores.push(
      stubMethod(
        prisma.participant_asset,
        'upsert',
        (async (args: any) => {
          states.push(args.update?.state ?? args.create?.state);
          return { id: 'asset-1' };
        })
      )
    );

    await markParticipantAssetProcessing({ recordingId: 'rec-1', participantId: 'part-1' });
    await markParticipantAssetFailed({
      recordingId: 'rec-1',
      participantId: 'part-1',
      reason: 'transcode_failed',
    });

    assert.deepEqual(states, ['processing', 'failed']);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('participant master selection is stable and prefers screen over camera video/audio', () => {
  const selected = selectParticipantMasterTrack([
    {
      id: 'track-audio',
      kind: 'audio',
      created_at: new Date('2026-03-09T10:00:00.000Z'),
    },
    {
      id: 'track-screen',
      kind: 'screen',
      created_at: new Date('2026-03-09T10:00:01.000Z'),
    },
    {
      id: 'track-video',
      kind: 'video',
      created_at: new Date('2026-03-09T10:00:02.000Z'),
    },
  ]);

  assert.equal(selected?.id, 'track-screen');
});

test('participant master reconcile does not let a non-canonical track overwrite the participant asset', async () => {
  const restores: Array<() => void> = [];
  let upsertArgs: any = null;

  try {
    restores.push(
      stubMethod(prisma.participant, 'findFirst', async () => ({
        id: 'part-1',
        track: [
          {
            id: 'track-video',
            kind: 'video',
            state: 'uploaded',
            storage_key_final: null,
            duration_ms: null,
            created_at: new Date('2026-03-09T10:00:00.000Z'),
          },
          {
            id: 'track-audio',
            kind: 'audio',
            state: 'processed',
            storage_key_final: 'recordings/rec-1/tracks/track-audio/final/track-audio.wav',
            duration_ms: 1200,
            created_at: new Date('2026-03-09T10:00:01.000Z'),
          },
        ],
      }))
    );
    restores.push(
      stubMethod(prisma.participant_asset, 'upsert', async (args: any) => {
        upsertArgs = args;
        return { id: 'asset-1' } as any;
      })
    );

    await reconcileParticipantMasterAsset({
      recordingId: 'rec-1',
      participantId: 'part-1',
      readySource: {
        trackId: 'track-audio',
        storageKey: 'recordings/rec-1/participants/part-1/master.wav',
        exportSet: ['wav'],
      },
    });

    assert.equal(upsertArgs.update.state, 'processing');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('participant master reconcile promotes the canonical source track with stable metadata', async () => {
  const restores: Array<() => void> = [];
  let upsertArgs: any = null;

  try {
    restores.push(
      stubMethod(prisma.participant, 'findFirst', async () => ({
        id: 'part-1',
        track: [
          {
            id: 'track-video',
            kind: 'video',
            state: 'uploaded',
            storage_key_final: null,
            duration_ms: null,
            created_at: new Date('2026-03-09T10:00:00.000Z'),
          },
          {
            id: 'track-audio',
            kind: 'audio',
            state: 'processed',
            storage_key_final: 'recordings/rec-1/tracks/track-audio/final/track-audio.wav',
            duration_ms: 1200,
            created_at: new Date('2026-03-09T10:00:01.000Z'),
          },
        ],
      }))
    );
    restores.push(
      stubMethod(prisma.participant_asset, 'upsert', async (args: any) => {
        upsertArgs = args;
        return { id: 'asset-1' } as any;
      })
    );

    await reconcileParticipantMasterAsset({
      recordingId: 'rec-1',
      participantId: 'part-1',
      readySource: {
        trackId: 'track-video',
        storageKey: 'recordings/rec-1/participants/part-1/master.mp4',
        previewKey: 'recordings/rec-1/participants/part-1/master.mp4',
        durationMs: 2400,
        exportSet: ['mp4'],
      },
    });

    assert.equal(upsertArgs.update.state, 'ready');
    assert.equal(upsertArgs.update.storage_key, 'recordings/rec-1/participants/part-1/master.mp4');
    assert.equal(upsertArgs.update.metadata_json.selectionRule, 'screen_then_video_then_audio');
    assert.equal(upsertArgs.update.metadata_json.sourceTrackId, 'track-video');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('list participant assets returns UI-facing payload without track/chunk traversal', async () => {
  const restores: Array<() => void> = [];

  try {
    restores.push(
      stubMethod(
        prisma.participant_asset,
        'findMany',
        (async () => [
          {
            id: 'asset-1',
            recording_id: 'rec-1',
            participant_id: 'part-1',
            state: 'ready',
            storage_key: 'recordings/rec-1/tracks/t1/final/video.mp4',
            preview_key: 'recordings/rec-1/tracks/t1/final/video.mp4',
            duration_ms: 1500,
            resolution: '1280x720',
            processing_started_at: new Date('2026-03-09T10:00:00.000Z'),
            ready_at: new Date('2026-03-09T10:00:05.000Z'),
            failed_at: null,
            failure_reason: null,
            export_set_json: ['mp4'],
            metadata_json: { sourceTrackId: 'track-1' },
            participant: {
              id: 'part-1',
              role: 'guest',
              display_name: 'Guest One',
              email: null,
            },
          },
        ])
      )
    );

    const payload = await listParticipantAssetsForRecording('rec-1');
    assert.equal(payload.length, 1);
    assert.equal(payload[0]?.participantName, 'Guest One');
    assert.equal(payload[0]?.state, 'ready');
    assert.deepEqual(payload[0]?.exportSet, ['mp4']);
    assert.deepEqual(payload[0]?.metadata, { sourceTrackId: 'track-1' });
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
