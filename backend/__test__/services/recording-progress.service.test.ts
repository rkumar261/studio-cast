import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma.js';
import { getRecordingProgressService } from '../../src/services/recording-progress.service.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

function makeRecordingForProgress(overrides: Partial<AnyRecord> = {}) {
  return {
    id: 'rec-1',
    userId: 'user-1',
    status: 'processing',
    started_at: new Date('2026-03-14T10:00:00.000Z'),
    stopped_at: new Date('2026-03-14T10:10:00.000Z'),
    host_participant_id: 'part-1',
    control_version: 1,
    export_artifact: [],
    combined_asset: [],
    participant: [
      {
        id: 'part-1',
        role: 'host',
        display_name: 'Host User',
        track: [
          {
            id: 'track-1',
            kind: 'video',
            state: 'processed',
            storage_key_raw: 'recordings/rec-1/tracks/track-1/raw.webm',
            final_seq: 2,
            capture_closed_at: new Date('2026-03-14T10:10:00.000Z'),
            track_chunk: [
              {
                seq: 1,
                protocol: 'tus',
                state: 'uploaded',
                bytes_received: 10,
                updated_at: new Date('2026-03-14T10:00:01.000Z'),
                storage_key_raw: 'recordings/rec-1/tracks/track-1/chunks/1.webm',
              },
              {
                seq: 2,
                protocol: 'tus',
                state: 'uploaded',
                bytes_received: 10,
                updated_at: new Date('2026-03-14T10:00:02.000Z'),
                storage_key_raw: 'recordings/rec-1/tracks/track-1/chunks/2.webm',
              },
            ],
            upload: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeParticipantMasterRow(args: {
  state: 'pending' | 'processing' | 'ready' | 'failed';
  storageKey?: string | null;
}) {
  return {
    id: 'part-1',
    role: 'host',
    display_name: 'Host User',
    email: null,
    track: [
      {
        id: 'track-1',
        kind: 'video',
        state: args.state === 'ready' ? 'processed' : 'uploaded',
        storage_key_final: args.storageKey ?? null,
        duration_ms: 1000,
        created_at: new Date('2026-03-14T10:00:00.000Z'),
      },
    ],
    participant_asset: [
      {
        id: 'asset-1',
        recording_id: 'rec-1',
        participant_id: 'part-1',
        state: args.state,
        storage_key: args.storageKey ?? null,
        preview_key: args.storageKey ?? null,
        duration_ms: 1000,
        resolution: '1280x720',
        processing_started_at: new Date('2026-03-14T10:00:03.000Z'),
        ready_at: args.state === 'ready' ? new Date('2026-03-14T10:00:05.000Z') : null,
        failed_at: null,
        failure_reason: null,
        export_set_json: ['mp4'],
        metadata_json: {},
      },
    ],
  };
}

test('recording progress reports upload complete in studio while project processing continues', async () => {
  const restores: Array<() => void> = [];

  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => makeRecordingForProgress())
    );
    restores.push(
      stubMethod(prisma.participant, 'findMany', async () => [
        makeParticipantMasterRow({ state: 'processing' }),
      ])
    );

    const result = await getRecordingProgressService({
      recordingId: 'rec-1',
      principal: { kind: 'user', userId: 'user-1' },
    });

    assert.equal(result.code, 'ok');
    if (result.code !== 'ok') throw new Error('expected ok result');
    assert.equal(result.data.studioState, 'upload complete');
    assert.equal(result.data.projectState, 'processing');
    assert.equal(result.data.studio.canOpenProject, true);
    assert.equal(result.data.summary.participantsComplete, 1);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('recording progress keeps project processing while combined asset is still building', async () => {
  const restores: Array<() => void> = [];

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        async () =>
          makeRecordingForProgress({
            combined_asset: [
              {
                id: 'combined-1',
                state: 'pending',
                failure_reason: null,
              },
            ],
          })
      )
    );
    restores.push(
      stubMethod(prisma.participant, 'findMany', async () => [
        makeParticipantMasterRow({
          state: 'ready',
          storageKey: 'recordings/rec-1/participants/part-1/master.mp4',
        }),
      ])
    );

    const result = await getRecordingProgressService({
      recordingId: 'rec-1',
      principal: { kind: 'user', userId: 'user-1' },
    });

    assert.equal(result.code, 'ok');
    if (result.code !== 'ok') throw new Error('expected ok result');
    assert.equal(result.data.studioState, 'upload complete');
    assert.equal(result.data.projectState, 'processing');
    assert.equal(result.data.summary.participantsUploading, 0);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('recording progress surfaces action required when a participant upload is not finalized', async () => {
  const restores: Array<() => void> = [];

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        async () =>
          makeRecordingForProgress({
            participant: [
              {
                id: 'part-1',
                role: 'host',
                display_name: 'Host User',
                track: [
                  {
                    id: 'track-1',
                    kind: 'video',
                    state: 'uploaded',
                    storage_key_raw: null,
                    final_seq: null,
                    capture_closed_at: null,
                    track_chunk: [],
                    upload: [],
                  },
                ],
              },
            ],
          })
      )
    );
    restores.push(stubMethod(prisma.participant, 'findMany', async () => []));

    const result = await getRecordingProgressService({
      recordingId: 'rec-1',
      principal: { kind: 'user', userId: 'user-1' },
    });

    assert.equal(result.code, 'ok');
    if (result.code !== 'ok') throw new Error('expected ok result');
    assert.equal(result.data.studioState, 'action required');
    assert.equal(result.data.participants[0].state, 'action required');
    assert.match(result.data.participants[0].blockedReason ?? '', /Finish recording/);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
