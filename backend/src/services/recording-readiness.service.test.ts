import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma.js';
import { reconcileRecordingReadiness } from './recording-readiness.service.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeRecording(overrides: Partial<AnyRecord> = {}) {
  return {
    id: 'rec-1',
    status: 'uploading',
    stopped_at: new Date('2026-03-14T10:00:00.000Z'),
    failed_at: null,
    failure_reason: null,
    track: [],
    ...overrides,
  };
}

function makeTrack(id: string) {
  return { id };
}

function makeExportArtifact(id: string, type: string, state: string) {
  return {
    id,
    type,
    state,
    updated_at: new Date('2026-03-14T10:01:00.000Z'),
    created_at: new Date('2026-03-14T10:00:00.000Z'),
  };
}

/**
 * Returns a combined_asset already in ready state whose sourceFingerprint matches
 * a single participant asset (id=asset-1, updatedAt=2026-03-14T10:00:00.000Z,
 * mode=concat_all). This makes reconcileCombinedAssetForRecording skip composition
 * and return ok without touching the actual FFmpeg runner.
 */
function makeReadyCombinedAsset() {
  return {
    id: 'combined-1',
    recording_id: 'rec-1',
    state: 'ready',
    storage_key: 'recordings/rec-1/combined/all-participants.mp4',
    preview_key: 'recordings/rec-1/combined/all-participants.mp4',
    duration_ms: 5000,
    resolution: '1280x720',
    processing_started_at: new Date('2026-03-14T10:00:01.000Z'),
    ready_at: new Date('2026-03-14T10:00:05.000Z'),
    failed_at: null,
    failure_reason: null,
    export_set_json: ['mp4', 'wav'],
    metadata_json: {
      sourceFingerprint: 'concat_all:asset-part-1:2026-03-14T10:00:00.000Z',
    },
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
        created_at: new Date('2026-03-14T10:00:00.000Z'),
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
        processing_started_at: new Date('2026-03-14T10:00:00.000Z'),
        ready_at: args.readyAt ?? null,
        failed_at: args.assetState === 'failed' ? new Date('2026-03-14T10:00:05.000Z') : null,
        failure_reason: args.failureReason ?? null,
        export_set_json: ['mp4'],
        metadata_json: { sourceTrackId: `track-${args.participantId}` },
      },
    ],
  };
}

/** Stubs combined reconcile to succeed via fingerprint cache (no FFmpeg call). */
function stubReadyCombined(restores: Array<() => void>) {
  restores.push(
    stubMethod(prisma.participant, 'findMany', async () => [
      makeParticipantRow({
        participantId: 'part-1',
        assetState: 'ready',
        storageKey: 'recordings/rec-1/participants/part-1/master.mp4',
        readyAt: new Date('2026-03-14T10:00:00.000Z'),
      }),
    ])
  );
  restores.push(
    stubMethod(prisma.combined_asset, 'findUnique', async () => makeReadyCombinedAsset())
  );
}

// ─── skip cases ───────────────────────────────────────────────────────────────

test('reconcileRecordingReadiness returns not_found for missing recording', async () => {
  const restores: Array<() => void> = [];
  try {
    restores.push(stubMethod(prisma.recording, 'findUnique', async () => null));

    const result = await reconcileRecordingReadiness('rec-missing');
    assert.equal(result.code, 'not_found');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('reconcileRecordingReadiness skips when recording is not stopped', async () => {
  const restores: Array<() => void> = [];
  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () =>
        makeRecording({ stopped_at: null })
      )
    );

    const result = await reconcileRecordingReadiness('rec-1');
    assert.equal(result.code, 'skipped');
    assert.equal(result.reason, 'recording_not_stopped');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('reconcileRecordingReadiness skips when recording has no tracks', async () => {
  const restores: Array<() => void> = [];
  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => makeRecording({ track: [] }))
    );

    const result = await reconcileRecordingReadiness('rec-1');
    assert.equal(result.code, 'skipped');
    assert.equal(result.reason, 'no_tracks');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('reconcileRecordingReadiness waits for participant masters instead of raw track state alone', async () => {
  const restores: Array<() => void> = [];
  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () =>
        makeRecording({
          track: [makeTrack('track-1')],
        })
      )
    );
    restores.push(
      stubMethod(prisma.participant, 'findMany', async () => [
        makeParticipantRow({
          participantId: 'part-1',
          assetState: 'processing',
        }),
      ])
    );
    restores.push(stubMethod(prisma.recording, 'update', async () => ({} as any)));

    const result = await reconcileRecordingReadiness('rec-1');
    assert.equal(result.code, 'skipped');
    assert.equal(result.reason, 'participant_assets_not_ready');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('reconcileRecordingReadiness surfaces failed participant masters', async () => {
  const restores: Array<() => void> = [];
  let updatedStatus: string | null = null;
  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () =>
        makeRecording({ track: [makeTrack('track-1')] })
      )
    );
    restores.push(
      stubMethod(prisma.participant, 'findMany', async () => [
        makeParticipantRow({
          participantId: 'part-1',
          assetState: 'failed',
          failureReason: 'participant_master_failed',
        }),
      ])
    );
    restores.push(
      stubMethod(prisma.recording, 'update', async (args: any) => {
        updatedStatus = args.data.status;
        return {} as any;
      })
    );

    const result = await reconcileRecordingReadiness('rec-1');
    assert.equal(result.code, 'skipped');
    assert.equal(result.reason, 'participant_assets_failed');
    assert.equal(updatedStatus, 'error');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

// ─── recording status transitions ─────────────────────────────────────────────

test('reconcileRecordingReadiness sets recording to ready when all required exports succeed', async () => {
  const restores: Array<() => void> = [];
  let updatedStatus: string | null = null;

  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () =>
        makeRecording({ status: 'processing', track: [makeTrack('track-1')] })
      )
    );
    stubReadyCombined(restores);

    const allSucceeded = [
      makeExportArtifact('export-wav', 'wav', 'succeeded'),
      makeExportArtifact('export-mp4', 'mp4', 'succeeded'),
      makeExportArtifact('export-captions', 'mp4_captions', 'succeeded'),
    ];
    restores.push(stubMethod(prisma.export_artifact, 'findMany', async () => allSucceeded));
    restores.push(stubMethod(prisma.export_artifact, 'create', async () => ({} as any)));
    restores.push(stubMethod(prisma.export_artifact, 'update', async () => ({} as any)));
    restores.push(stubMethod(prisma.job, 'findMany', async () => []));
    restores.push(stubMethod(prisma.job, 'create', async () => ({} as any)));
    restores.push(
      stubMethod(prisma.recording, 'update', async (args: any) => {
        updatedStatus = args.data.status;
        return {} as any;
      })
    );

    const result = await reconcileRecordingReadiness('rec-1');
    assert.equal(result.code, 'ok');
    assert.equal(result.status, 'ready');
    assert.equal(updatedStatus, 'ready');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('reconcileRecordingReadiness sets recording to error when any required export fails', async () => {
  const restores: Array<() => void> = [];
  let updatedStatus: string | null = null;

  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () =>
        makeRecording({ status: 'processing', track: [makeTrack('track-1')] })
      )
    );
    stubReadyCombined(restores);

    const withFailure = [
      makeExportArtifact('export-wav', 'wav', 'succeeded'),
      makeExportArtifact('export-mp4', 'mp4', 'failed'),
      makeExportArtifact('export-captions', 'mp4_captions', 'succeeded'),
    ];
    restores.push(stubMethod(prisma.export_artifact, 'findMany', async () => withFailure));
    restores.push(stubMethod(prisma.export_artifact, 'create', async () => ({} as any)));
    restores.push(stubMethod(prisma.export_artifact, 'update', async () => ({} as any)));
    restores.push(stubMethod(prisma.job, 'findMany', async () => []));
    restores.push(stubMethod(prisma.job, 'create', async () => ({} as any)));
    restores.push(
      stubMethod(prisma.recording, 'update', async (args: any) => {
        updatedStatus = args.data.status;
        return {} as any;
      })
    );

    const result = await reconcileRecordingReadiness('rec-1');
    assert.equal(result.code, 'ok');
    assert.equal(result.status, 'error');
    assert.equal(updatedStatus, 'error');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('reconcileRecordingReadiness keeps recording at processing when exports are still pending', async () => {
  const restores: Array<() => void> = [];
  let updatedStatus: string | null = null;

  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () =>
        makeRecording({ status: 'processing', track: [makeTrack('track-1')] })
      )
    );
    stubReadyCombined(restores);

    const pendingExports = [
      makeExportArtifact('export-wav', 'wav', 'running'),
      makeExportArtifact('export-mp4', 'mp4', 'queued'),
      makeExportArtifact('export-captions', 'mp4_captions', 'queued'),
    ];
    restores.push(stubMethod(prisma.export_artifact, 'findMany', async () => pendingExports));
    restores.push(stubMethod(prisma.export_artifact, 'create', async () => ({} as any)));
    restores.push(stubMethod(prisma.export_artifact, 'update', async () => ({} as any)));
    restores.push(stubMethod(prisma.job, 'findMany', async () => []));
    restores.push(stubMethod(prisma.job, 'create', async () => ({} as any)));
    restores.push(
      stubMethod(prisma.recording, 'update', async (args: any) => {
        updatedStatus = args.data.status;
        return {} as any;
      })
    );

    const result = await reconcileRecordingReadiness('rec-1');
    assert.equal(result.code, 'ok');
    assert.equal(result.status, 'processing');
    if (updatedStatus !== null) {
      assert.equal(updatedStatus, 'processing');
    }
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('reconcileRecordingReadiness creates missing export artifacts and enqueues jobs', async () => {
  const restores: Array<() => void> = [];
  const createdArtifactTypes: string[] = [];
  const enqueuedJobTypes: string[] = [];

  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () =>
        makeRecording({ status: 'uploading', track: [makeTrack('track-1')] })
      )
    );
    stubReadyCombined(restores);

    // No export artifacts exist — they must be created
    restores.push(stubMethod(prisma.export_artifact, 'findMany', async () => []));
    restores.push(
      stubMethod(prisma.export_artifact, 'create', async (args: any) => {
        createdArtifactTypes.push(args.data.type);
        return {
          id: `artifact-${args.data.type}`,
          type: args.data.type,
          state: 'queued',
          updated_at: new Date(),
          created_at: new Date(),
          combined_asset_id: args.data.combined_asset_id ?? null,
        };
      })
    );
    restores.push(stubMethod(prisma.export_artifact, 'update', async () => ({} as any)));
    restores.push(stubMethod(prisma.job, 'findMany', async () => []));
    restores.push(
      stubMethod(prisma.job, 'create', async (args: any) => {
        enqueuedJobTypes.push(args.data.type);
        return { id: `job-${args.data.type}`, ...args.data } as any;
      })
    );
    restores.push(stubMethod(prisma.recording, 'update', async () => ({} as any)));

    await reconcileRecordingReadiness('rec-1');

    assert.ok(createdArtifactTypes.includes('wav'), 'wav artifact must be created');
    assert.ok(createdArtifactTypes.includes('mp4'), 'mp4 artifact must be created');
    assert.ok(createdArtifactTypes.includes('mp4_captions'), 'mp4_captions artifact must be created');
    assert.ok(enqueuedJobTypes.includes('export'), 'export jobs must be enqueued');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
