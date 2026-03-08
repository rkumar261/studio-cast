import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma.js';
import {
  completeTrackChunkService,
  initiateTrackChunkService,
} from './track-chunk.service.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

function makeChunkRow(input: Partial<AnyRecord> & { id: string; track_id: string; seq: number }) {
  const now = new Date();
  return {
    id: input.id,
    track_id: input.track_id,
    seq: input.seq,
    protocol: (input.protocol as string | null | undefined) ?? 'multipart',
    state: (input.state as string | undefined) ?? 'initiated',
    bytes_received: (input.bytes_received as bigint | undefined) ?? BigInt(0),
    bytes_expected: (input.bytes_expected as bigint | null | undefined) ?? null,
    tus_upload_id: (input.tus_upload_id as string | null | undefined) ?? null,
    tus_resource_url: (input.tus_resource_url as string | null | undefined) ?? null,
    tus_upload_state: (input.tus_upload_state as string | null | undefined) ?? null,
    failure_reason: (input.failure_reason as string | null | undefined) ?? null,
    last_error_at: (input.last_error_at as Date | null | undefined) ?? null,
    materialized_at: (input.materialized_at as Date | null | undefined) ?? null,
    storage_key_raw: (input.storage_key_raw as string | null | undefined) ?? null,
    etag: (input.etag as string | null | undefined) ?? null,
    checksum_sha256: (input.checksum_sha256 as string | null | undefined) ?? null,
    created_at: (input.created_at as Date | undefined) ?? now,
    updated_at: (input.updated_at as Date | undefined) ?? now,
  };
}

test('initiate same (trackId, seq) twice returns accepted then existing', async () => {
  const restores: Array<() => void> = [];
  const chunks = new Map<string, ReturnType<typeof makeChunkRow>>();

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        (async () => ({ id: 'rec-1', userId: 'owner-1' }))
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
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track_chunk,
        'findMany',
        (async () => Array.from(chunks.values()).sort((a, b) => a.seq - b.seq))
      )
    );
    restores.push(
      stubMethod(
        prisma.track_chunk,
        'findUnique',
        (async (args: any) => {
          if (args?.where?.track_id_seq) {
            const key = `${args.where.track_id_seq.track_id}:${args.where.track_id_seq.seq}`;
            return chunks.get(key) ?? null;
          }
          if (args?.where?.id) {
            return Array.from(chunks.values()).find((c) => c.id === args.where.id) ?? null;
          }
          return null;
        })
      )
    );
    restores.push(
      stubMethod(
        prisma.track_chunk,
        'create',
        (async (args: any) => {
          const row = makeChunkRow({
            id: `chunk-${args.data.seq}`,
            track_id: args.data.track_id,
            seq: args.data.seq,
            protocol: args.data.protocol ?? null,
            bytes_expected: args.data.bytes_expected ?? null,
            state: args.data.state ?? 'initiated',
          });
          const key = `${row.track_id}:${row.seq}`;
          chunks.set(key, row);
          return row;
        })
      )
    );
    restores.push(
      stubMethod(prisma.track, 'update', async () => ({} as any))
    );

    const first = await initiateTrackChunkService({
      recordingId: 'rec-1',
      principal: { kind: 'user', userId: 'owner-1' },
      body: {
        trackId: 'track-1',
        seq: 1,
        protocol: 'multipart',
        bytesExpected: 100,
      },
    });
    assert.equal(first.code, 'ok');
    assert.equal(first.data.status, 'accepted');
    assert.equal(first.data.existed, false);
    assert.equal(first.data.chunk?.seq, 1);

    const second = await initiateTrackChunkService({
      recordingId: 'rec-1',
      principal: { kind: 'user', userId: 'owner-1' },
      body: {
        trackId: 'track-1',
        seq: 1,
        protocol: 'multipart',
        bytesExpected: 100,
      },
    });
    assert.equal(second.code, 'ok');
    assert.equal(second.data.status, 'existing');
    assert.equal(second.data.existed, true);
    assert.equal(second.data.chunk?.id, first.data.chunk?.id);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('complete same chunk twice is idempotent', async () => {
  const restores: Array<() => void> = [];
  const chunk = makeChunkRow({
    id: 'chunk-1',
    track_id: 'track-1',
    seq: 1,
    protocol: 'multipart',
    state: 'initiated',
    bytes_expected: BigInt(100),
  });

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        (async () => ({
          id: 'rec-1',
          userId: 'owner-1',
          status: 'uploading',
          started_at: null,
          stopped_at: null,
          host_participant_id: null,
          control_version: 1,
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track_chunk,
        'findUnique',
        (async (args: any) => {
          if (args?.where?.id !== 'chunk-1') return null;
          if (args?.include?.track) {
            return {
              ...chunk,
              track: {
                id: 'track-1',
                recording_id: 'rec-1',
                participant_id: 'participant-1',
              },
            } as any;
          }
          return chunk as any;
        })
      )
    );
    restores.push(
      stubMethod(
        prisma.track_chunk,
        'update',
        (async (args: any) => {
          Object.assign(chunk, args.data, { updated_at: new Date() });
          return chunk as any;
        })
      )
    );

    const first = await completeTrackChunkService({
      recordingId: 'rec-1',
      chunkId: 'chunk-1',
      principal: { kind: 'user', userId: 'owner-1' },
      body: {
        protocol: 'multipart',
        bytesReceived: 100,
        storageKeyRaw: 'recordings/rec-1/tracks/track-1/chunks/1.webm',
      },
    });
    assert.equal(first.code, 'ok');
    assert.equal(first.data.chunk.state, 'uploaded');
    assert.equal(first.data.already, undefined);

    const second = await completeTrackChunkService({
      recordingId: 'rec-1',
      chunkId: 'chunk-1',
      principal: { kind: 'user', userId: 'owner-1' },
      body: {
        protocol: 'multipart',
        bytesReceived: 100,
        storageKeyRaw: 'recordings/rec-1/tracks/track-1/chunks/1.webm',
      },
    });
    assert.equal(second.code, 'ok');
    assert.equal(second.data.chunk.state, 'uploaded');
    assert.equal(second.data.already, true);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('seq mismatch returns recovery-friendly payload', async () => {
  const restores: Array<() => void> = [];
  const chunks = new Map<string, ReturnType<typeof makeChunkRow>>();
  chunks.set('track-1:1', makeChunkRow({ id: 'chunk-1', track_id: 'track-1', seq: 1, state: 'uploaded' }));

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        (async () => ({ id: 'rec-1', userId: 'owner-1' }))
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
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track_chunk,
        'findMany',
        (async () => Array.from(chunks.values()).sort((a, b) => a.seq - b.seq))
      )
    );
    restores.push(
      stubMethod(
        prisma.track_chunk,
        'findUnique',
        (async () => null)
      )
    );

    const result = await initiateTrackChunkService({
      recordingId: 'rec-1',
      principal: { kind: 'user', userId: 'owner-1' },
      body: {
        trackId: 'track-1',
        seq: 3,
        protocol: 'multipart',
      },
    });
    assert.equal(result.code, 'ok');
    assert.equal(result.data.status, 'seq_mismatch');
    assert.equal(result.data.nextExpectedSeq, 2);
    assert.equal(result.data.highestContiguousUploadedSeq, 1);
    assert.equal(result.data.reconciliation?.reason, 'ahead');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('guest can upload only own participant track', async () => {
  const restores: Array<() => void> = [];
  const chunks = new Map<string, ReturnType<typeof makeChunkRow>>();

  try {
    restores.push(
      stubMethod(
        prisma.recording,
        'findUnique',
        (async () => ({ id: 'rec-1', userId: 'owner-1' }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track,
        'findUnique',
        (async (args: any) => {
          if (args?.where?.id === 'track-guest') {
            return {
              id: 'track-guest',
              recording_id: 'rec-1',
              participant_id: 'guest-participant',
              final_seq: null,
              capture_closed_at: null,
            };
          }
          if (args?.where?.id === 'track-host') {
            return {
              id: 'track-host',
              recording_id: 'rec-1',
              participant_id: 'host-participant',
              final_seq: null,
              capture_closed_at: null,
            };
          }
          return null;
        })
      )
    );
    restores.push(
      stubMethod(
        prisma.track_chunk,
        'findMany',
        (async (args: any) =>
          Array.from(chunks.values())
            .filter((row) => row.track_id === args?.where?.track_id)
            .sort((a, b) => a.seq - b.seq))
      )
    );
    restores.push(
      stubMethod(
        prisma.track_chunk,
        'findUnique',
        (async () => null)
      )
    );
    restores.push(
      stubMethod(
        prisma.track_chunk,
        'create',
        (async (args: any) => {
          const row = makeChunkRow({
            id: `chunk-${args.data.track_id}-${args.data.seq}`,
            track_id: args.data.track_id,
            seq: args.data.seq,
            protocol: args.data.protocol,
            state: 'initiated',
          });
          chunks.set(`${row.track_id}:${row.seq}`, row);
          return row;
        })
      )
    );
    restores.push(
      stubMethod(prisma.track, 'update', async () => ({} as any))
    );

    const ownTrackResult = await initiateTrackChunkService({
      recordingId: 'rec-1',
      principal: { kind: 'guest', participantId: 'guest-participant', recordingId: 'rec-1' },
      body: {
        trackId: 'track-guest',
        seq: 1,
        protocol: 'multipart',
      },
    });
    assert.equal(ownTrackResult.code, 'ok');
    assert.equal(ownTrackResult.data.status, 'accepted');

    const otherTrackResult = await initiateTrackChunkService({
      recordingId: 'rec-1',
      principal: { kind: 'guest', participantId: 'guest-participant', recordingId: 'rec-1' },
      body: {
        trackId: 'track-host',
        seq: 1,
        protocol: 'multipart',
      },
    });
    assert.equal(otherTrackResult.code, 'forbidden');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
