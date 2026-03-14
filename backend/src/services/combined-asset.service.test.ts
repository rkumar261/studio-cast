import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma.js';
import { reconcileCombinedAssetForRecording } from './combined-asset.service.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

test('combined reconcile is idempotent when ready fingerprint matches', async () => {
  const restores: Array<() => void> = [];
  let upsertCalled = false;

  try {
    restores.push(
      stubMethod(
        prisma.participant_asset,
        'findMany',
        async () => [
          {
            id: 'asset-1',
            storage_key: 'recordings/rec-1/tracks/t1/final/video.mp4',
            updated_at: new Date('2026-03-09T10:00:00.000Z'),
          },
        ]
      )
    );
    restores.push(
      stubMethod(
        prisma.combined_asset,
        'findUnique',
        async () => ({
          id: 'combined-1',
          recording_id: 'rec-1',
          state: 'ready',
          storage_key: 'recordings/rec-1/combined/all-participants.mp4',
          preview_key: 'recordings/rec-1/combined/all-participants.mp4',
          duration_ms: 1000,
          resolution: '1280x720',
          processing_started_at: new Date('2026-03-09T10:00:00.000Z'),
          ready_at: new Date('2026-03-09T10:00:10.000Z'),
          failed_at: null,
          failure_reason: null,
          metadata_json: {
            sourceFingerprint: 'concat_all:asset-1:2026-03-09T10:00:00.000Z',
          },
          export_set_json: ['mp4', 'wav', 'mp4_captions'],
        })
      )
    );
    restores.push(
      stubMethod(prisma.combined_asset, 'upsert', async () => {
        upsertCalled = true;
        return {} as any;
      })
    );
    restores.push(stubMethod(prisma.combined_asset, 'update', async () => ({} as any)));

    const result = await reconcileCombinedAssetForRecording({
      recordingId: 'rec-1',
      composeRunner: async () => {
        throw new Error('compose should not run');
      },
    });

    assert.equal(result.code, 'ok');
    assert.equal(result.composed, false);
    assert.equal(result.asset.state, 'ready');
    assert.equal(upsertCalled, false);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('combined reconcile composes and marks ready', async () => {
  const restores: Array<() => void> = [];
  let upsertArgs: any = null;
  let updateArgs: any = null;

  try {
    restores.push(
      stubMethod(
        prisma.participant_asset,
        'findMany',
        async () => [
          {
            id: 'asset-1',
            storage_key: 'recordings/rec-1/tracks/t1/final/video.mp4',
            updated_at: new Date('2026-03-09T10:00:00.000Z'),
          },
          {
            id: 'asset-2',
            storage_key: 'recordings/rec-1/tracks/t2/final/video.mp4',
            updated_at: new Date('2026-03-09T10:00:01.000Z'),
          },
        ]
      )
    );
    restores.push(stubMethod(prisma.combined_asset, 'findUnique', async () => null));
    restores.push(
      stubMethod(prisma.combined_asset, 'upsert', async (args: any) => {
        upsertArgs = args;
        return {} as any;
      })
    );
    restores.push(
      stubMethod(prisma.combined_asset, 'update', async (args: any) => {
        updateArgs = args;
        return {
          id: 'combined-1',
          recording_id: 'rec-1',
          state: args.data.state,
          storage_key: args.data.storage_key ?? null,
          preview_key: args.data.preview_key ?? null,
          duration_ms: args.data.duration_ms ?? null,
          resolution: args.data.resolution ?? null,
          processing_started_at: new Date('2026-03-09T10:00:02.000Z'),
          ready_at: new Date('2026-03-09T10:00:03.000Z'),
          failed_at: null,
          failure_reason: null,
          metadata_json: args.data.metadata_json ?? null,
          export_set_json: args.data.export_set_json ?? [],
        };
      })
    );

    const result = await reconcileCombinedAssetForRecording({
      recordingId: 'rec-1',
      composeRunner: async () => ({
        storageKey: 'recordings/rec-1/combined/all-participants.mp4',
        previewKey: 'recordings/rec-1/combined/all-participants.mp4',
        durationMs: 2000,
        resolution: '1920x1080',
        exportSet: ['mp4', 'wav', 'mp4_captions'],
        mode: 'concat_all',
        sourceAssetIds: ['asset-1', 'asset-2'],
      }),
    });

    assert.equal(result.code, 'ok');
    assert.equal(result.composed, true);
    assert.equal(result.asset.state, 'ready');
    assert.equal(upsertArgs.update.state, 'processing');
    assert.equal(updateArgs.data.state, 'ready');
    assert.equal(updateArgs.data.storage_key, 'recordings/rec-1/combined/all-participants.mp4');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('combined reconcile marks failed and leaves participant assets untouched on composition error', async () => {
  const restores: Array<() => void> = [];
  let participantWriteCalled = false;
  let combinedFailedUpdate: any = null;

  try {
    restores.push(
      stubMethod(
        prisma.participant_asset,
        'findMany',
        async () => [
          {
            id: 'asset-1',
            storage_key: 'recordings/rec-1/tracks/t1/final/video.mp4',
            updated_at: new Date('2026-03-09T10:00:00.000Z'),
          },
        ]
      )
    );
    restores.push(
      stubMethod(prisma.participant_asset, 'update', async () => {
        participantWriteCalled = true;
        return {} as any;
      })
    );
    restores.push(stubMethod(prisma.combined_asset, 'findUnique', async () => null));
    restores.push(stubMethod(prisma.combined_asset, 'upsert', async () => ({} as any)));
    restores.push(
      stubMethod(prisma.combined_asset, 'update', async (args: any) => {
        combinedFailedUpdate = args;
        return {} as any;
      })
    );

    const result = await reconcileCombinedAssetForRecording({
      recordingId: 'rec-1',
      composeRunner: async () => {
        throw new Error('compose_failed');
      },
    });

    assert.equal(result.code, 'failed');
    assert.equal(participantWriteCalled, false);
    assert.equal(combinedFailedUpdate.data.state, 'failed');
    assert.equal(combinedFailedUpdate.data.failure_reason, 'compose_failed');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
