import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma.js';
import { reconcileCombinedAssetForRecording } from '../../src/services/combined-asset.service.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

function makeParticipantRow(args: {
  participantId: string;
  assetState: 'pending' | 'processing' | 'ready' | 'failed';
  storageKey?: string | null;
  failureReason?: string | null;
  readyAt?: Date | null;
}) {
  return {
    id: args.participantId,
    role: 'guest',
    display_name: `Participant ${args.participantId}`,
    email: null,
    track: [
      {
        id: `track-${args.participantId}`,
        kind: 'video',
        state: args.assetState === 'ready' ? 'processed' : 'uploaded',
        storage_key_final: args.storageKey ?? null,
        duration_ms: 1000,
        created_at: new Date('2026-03-09T10:00:00.000Z'),
      },
    ],
    participant_asset: [
      {
        id: `asset-${args.participantId}`,
        recording_id: 'rec-1',
        participant_id: args.participantId,
        state: args.assetState,
        storage_key: args.storageKey ?? null,
        preview_key: args.storageKey ?? null,
        duration_ms: 1000,
        resolution: '1280x720',
        processing_started_at: new Date('2026-03-09T10:00:00.000Z'),
        ready_at: args.readyAt ?? null,
        failed_at: args.assetState === 'failed' ? new Date('2026-03-09T10:00:05.000Z') : null,
        failure_reason: args.failureReason ?? null,
        export_set_json: ['mp4'],
        metadata_json: { sourceTrackId: `track-${args.participantId}` },
      },
    ],
  };
}

function stubRecordingLookup(restores: Array<() => void>, startedAt: Date | null = null) {
  restores.push(stubMethod(prisma.recording, 'findUnique', async () => ({ started_at: startedAt })));
}

test('combined reconcile is idempotent when ready fingerprint matches', async () => {
  const restores: Array<() => void> = [];
  let upsertCalled = false;

  try {
    restores.push(
      stubMethod(
        prisma.participant,
        'findMany',
        async () => [
          makeParticipantRow({
            participantId: 'part-1',
            assetState: 'ready',
            storageKey: 'recordings/rec-1/participants/part-1/master.mp4',
            readyAt: new Date('2026-03-09T10:00:00.000Z'),
          }),
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
            // fingerprint format: "${mode}:${id}:${updatedAtIso}:${audioStorageKey??''}:${startOffsetSec}"
            // mode default changed to side_by_side in BRD-11; empty audio key means "::0.000".
            sourceFingerprint: 'side_by_side:asset-part-1:2026-03-09T10:00:00.000Z::0.000',
          },
          export_set_json: ['mp4', 'wav', 'mp4_captions'],
        })
      )
    );
    // track.findMany is called before the fingerprint early-return check (code order).
    // Return [] — no separate audio tracks, matches the empty audioStorageKey in the fingerprint.
    restores.push(stubMethod(prisma.track, 'findMany', async () => []));
    stubRecordingLookup(restores);
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
        prisma.participant,
        'findMany',
        async () => [
          makeParticipantRow({
            participantId: 'part-1',
            assetState: 'ready',
            storageKey: 'recordings/rec-1/participants/part-1/master.mp4',
            readyAt: new Date('2026-03-09T10:00:00.000Z'),
          }),
          makeParticipantRow({
            participantId: 'part-2',
            assetState: 'ready',
            storageKey: 'recordings/rec-1/participants/part-2/master.mp4',
            readyAt: new Date('2026-03-09T10:00:01.000Z'),
          }),
        ]
      )
    );
    restores.push(stubMethod(prisma.combined_asset, 'findUnique', async () => null));
    // Audio tracks query added in BRD-11 for mixing separate audio into combined video.
    restores.push(stubMethod(prisma.track, 'findMany', async () => []));
    stubRecordingLookup(restores);
    restores.push(stubMethod(prisma.combined_asset, 'create', async () => ({ id: 'combined-1' }) as any));
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
        sourceAssetIds: ['asset-part-1', 'asset-part-2'],
      }),
    });

    assert.equal(result.code, 'ok');
    assert.equal(result.composed, true);
    assert.equal(result.asset.state, 'ready');
    // The claim path uses create (existing=null) not upsert; verify final state via update args.
    assert.equal(updateArgs.data.state, 'ready');
    assert.equal(updateArgs.data.storage_key, 'recordings/rec-1/combined/all-participants.mp4');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('combined reconcile marks failed and leaves participant assets untouched on composition error', async () => {
  const restores: Array<() => void> = [];
  let combinedFailedUpdate: any = null;

  try {
    restores.push(
      stubMethod(
        prisma.participant,
        'findMany',
        async () => [
          makeParticipantRow({
            participantId: 'part-1',
            assetState: 'ready',
            storageKey: 'recordings/rec-1/participants/part-1/master.mp4',
            readyAt: new Date('2026-03-09T10:00:00.000Z'),
          }),
        ]
      )
    );
    restores.push(stubMethod(prisma.combined_asset, 'findUnique', async () => null));
    // Audio tracks query added in BRD-11; no audio tracks in test setup.
    restores.push(stubMethod(prisma.track, 'findMany', async () => []));
    stubRecordingLookup(restores);
    restores.push(stubMethod(prisma.combined_asset, 'create', async () => ({ id: 'combined-1' }) as any));
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
    assert.equal(combinedFailedUpdate.data.state, 'failed');
    assert.equal(combinedFailedUpdate.data.failure_reason, 'compose_failed');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('combined reconcile waits until all applicable participant masters are ready', async () => {
  const restores: Array<() => void> = [];
  let combinedUpsertArgs: any = null;

  try {
    restores.push(
      stubMethod(
        prisma.participant,
        'findMany',
        async () => [
          makeParticipantRow({
            participantId: 'part-1',
            assetState: 'ready',
            storageKey: 'recordings/rec-1/participants/part-1/master.mp4',
            readyAt: new Date('2026-03-09T10:00:00.000Z'),
          }),
          makeParticipantRow({
            participantId: 'part-2',
            assetState: 'processing',
          }),
        ]
      )
    );
    restores.push(
      stubMethod(prisma.combined_asset, 'upsert', async (args: any) => {
        combinedUpsertArgs = args;
        return { id: 'combined-1' } as any;
      })
    );

    const result = await reconcileCombinedAssetForRecording({ recordingId: 'rec-1' });

    assert.equal(result.code, 'skipped');
    assert.equal(result.reason, 'participant_assets_not_ready');
    assert.equal(combinedUpsertArgs.update.state, 'pending');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('combined reconcile fails fast when a participant master fails', async () => {
  const restores: Array<() => void> = [];
  let combinedUpsertArgs: any = null;

  try {
    restores.push(
      stubMethod(
        prisma.participant,
        'findMany',
        async () => [
          makeParticipantRow({
            participantId: 'part-1',
            assetState: 'failed',
            failureReason: 'participant_master_failed',
          }),
        ]
      )
    );
    restores.push(
      stubMethod(prisma.combined_asset, 'upsert', async (args: any) => {
        combinedUpsertArgs = args;
        return { id: 'combined-1' } as any;
      })
    );

    const result = await reconcileCombinedAssetForRecording({ recordingId: 'rec-1' });

    assert.equal(result.code, 'failed');
    assert.equal(result.message, 'participant_master_failed');
    assert.equal(combinedUpsertArgs.update.state, 'failed');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

// Regression: BRD-11 — combined asset stuck in 'ready' with stale concat_all fingerprint
// must be recomposed when mode changes to side_by_side. The claim WHERE clause must
// include 'ready' state, not just 'pending'/'failed'.
test('combined reconcile recomposes when existing is ready but mode changed (stale fingerprint)', async () => {
  const restores: Array<() => void> = [];
  let composeCalled = false;
  let claimArgs: any = null;

  try {
    restores.push(
      stubMethod(
        prisma.participant,
        'findMany',
        async () => [
          makeParticipantRow({
            participantId: 'part-1',
            assetState: 'ready',
            storageKey: 'recordings/rec-1/participants/part-1/master.mp4',
            readyAt: new Date('2026-03-09T10:00:00.000Z'),
          }),
          makeParticipantRow({
            participantId: 'part-2',
            assetState: 'ready',
            storageKey: 'recordings/rec-1/participants/part-2/master.mp4',
            readyAt: new Date('2026-03-09T10:00:01.000Z'),
          }),
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
          duration_ms: 5000,
          resolution: '1280x720',
          processing_started_at: new Date('2026-03-09T10:00:00.000Z'),
          ready_at: new Date('2026-03-09T10:00:10.000Z'),
          failed_at: null,
          failure_reason: null,
          // Stale fingerprint from old concat_all mode — current mode is side_by_side
          metadata_json: {
            sourceFingerprint:
              'concat_all:asset-part-1:2026-03-09T10:00:00.000Z::0.000|asset-part-2:2026-03-09T10:00:01.000Z::0.000',
          },
          export_set_json: ['mp4', 'wav'],
        })
      )
    );
    restores.push(stubMethod(prisma.track, 'findMany', async () => []));
    stubRecordingLookup(restores);
    restores.push(
      stubMethod(prisma.combined_asset, 'updateMany', async (args: any) => {
        claimArgs = args;
        return { count: 1 };
      })
    );
    restores.push(
      stubMethod(prisma.combined_asset, 'update', async (args: any) => ({
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
      }) as any)
    );

    const result = await reconcileCombinedAssetForRecording({
      recordingId: 'rec-1',
      composeRunner: async () => {
        composeCalled = true;
        return {
          storageKey: 'recordings/rec-1/combined/all-participants.mp4',
          previewKey: 'recordings/rec-1/combined/all-participants.mp4',
          durationMs: 5000,
          resolution: '1920x540',
          exportSet: ['mp4', 'wav', 'mp4_captions'],
          mode: 'side_by_side',
          sourceAssetIds: ['asset-part-1', 'asset-part-2'],
        };
      },
    });

    assert.equal(result.code, 'ok');
    assert.equal(result.composed, true);
    assert.equal(composeCalled, true, 'compose runner must run when fingerprint is stale');
    // Claim must include 'ready' state so stale-ready rows can be reclaimed
    assert.ok(
      claimArgs?.where?.state?.in?.includes('ready'),
      'claim WHERE clause must include ready state for mode-change recomposition'
    );
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
