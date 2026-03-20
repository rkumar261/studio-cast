import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma.js';
import {
  completeTrackChunkService,
  getTrackChunkRecoveryService,
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
        protocol: 'presigned_url',
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
        protocol: 'presigned_url',
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
    protocol: 'presigned_url',
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
        'findMany',
        (async () => [chunk])
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
        protocol: 'presigned_url',
        bytesReceived: 100,
        storageKeyRaw: 'recordings/rec-1/tracks/track-1/chunks/1.webm',
      },
    });
    assert.equal(first.code, 'ok');
    assert.equal(first.data.chunk.state, 'uploaded');
    assert.equal(first.data.already, undefined);
    assert.equal(first.data.nextExpectedSeq, 2);
    assert.equal(first.data.highestContiguousUploadedSeq, 1);

    const second = await completeTrackChunkService({
      recordingId: 'rec-1',
      chunkId: 'chunk-1',
      principal: { kind: 'user', userId: 'owner-1' },
      body: {
        protocol: 'presigned_url',
        bytesReceived: 100,
        storageKeyRaw: 'recordings/rec-1/tracks/track-1/chunks/1.webm',
      },
    });
    assert.equal(second.code, 'ok');
    assert.equal(second.data.chunk.state, 'uploaded');
    assert.equal(second.data.already, true);
    assert.equal(second.data.nextExpectedSeq, 2);
    assert.equal(second.data.highestContiguousUploadedSeq, 1);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('initiate recovers from unique conflict race and returns existing row', async () => {
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
            protocol: args.data.protocol,
            bytes_expected: args.data.bytes_expected ?? null,
            state: args.data.state ?? 'initiated',
          });
          chunks.set(`${row.track_id}:${row.seq}`, row);
          const err = new Error('unique conflict') as Error & { code?: string };
          err.code = 'P2002';
          throw err;
        })
      )
    );
    restores.push(stubMethod(prisma.track, 'update', async () => ({} as any)));

    const result = await initiateTrackChunkService({
      recordingId: 'rec-1',
      principal: { kind: 'user', userId: 'owner-1' },
      body: {
        trackId: 'track-1',
        seq: 1,
        protocol: 'presigned_url',
        bytesExpected: 100,
      },
    });

    assert.equal(result.code, 'ok');
    assert.equal(result.data.status, 'existing');
    assert.equal(result.data.existed, true);
    assert.equal(result.data.chunk?.id, 'chunk-1');
    assert.equal(result.data.nextExpectedSeq, 2);
    assert.equal(result.data.highestContiguousUploadedSeq, 0);
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
        protocol: 'presigned_url',
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

test('stale seq mismatch returns recovery-friendly payload', async () => {
  const restores: Array<() => void> = [];
  const chunks = new Map<string, ReturnType<typeof makeChunkRow>>();
  chunks.set('track-1:1', makeChunkRow({ id: 'chunk-1', track_id: 'track-1', seq: 1, state: 'uploaded' }));
  chunks.set('track-1:3', makeChunkRow({ id: 'chunk-3', track_id: 'track-1', seq: 3, state: 'uploaded' }));

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
    restores.push(stubMethod(prisma.track_chunk, 'findUnique', (async () => null)));

    const result = await initiateTrackChunkService({
      recordingId: 'rec-1',
      principal: { kind: 'user', userId: 'owner-1' },
      body: {
        trackId: 'track-1',
        seq: 2,
        protocol: 'presigned_url',
      },
    });
    assert.equal(result.code, 'ok');
    assert.equal(result.data.status, 'seq_mismatch');
    assert.equal(result.data.nextExpectedSeq, 4);
    assert.equal(result.data.highestContiguousUploadedSeq, 1);
    assert.equal(result.data.reconciliation?.reason, 'stale');
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
        protocol: 'presigned_url',
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
        protocol: 'presigned_url',
      },
    });
    assert.equal(otherTrackResult.code, 'forbidden');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('guest cannot complete chunk for another participant track', async () => {
  const restores: Array<() => void> = [];
  const chunk = makeChunkRow({
    id: 'chunk-host-1',
    track_id: 'track-host',
    seq: 1,
    protocol: 'presigned_url',
    state: 'initiated',
  });

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
        prisma.track_chunk,
        'findUnique',
        (async () => ({
          ...chunk,
          track: {
            id: 'track-host',
            recording_id: 'rec-1',
            participant_id: 'host-participant',
          },
        }))
      )
    );

    const result = await completeTrackChunkService({
      recordingId: 'rec-1',
      chunkId: 'chunk-host-1',
      principal: { kind: 'guest', participantId: 'guest-participant', recordingId: 'rec-1' },
      body: {
        protocol: 'presigned_url',
        bytesReceived: 100,
        storageKeyRaw: 'recordings/rec-1/tracks/track-host/chunks/1.webm',
      },
    });

    assert.equal(result.code, 'forbidden');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('guest cannot read recovery snapshot for another participant track', async () => {
  const restores: Array<() => void> = [];

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
          id: 'track-host',
          recording_id: 'rec-1',
          participant_id: 'host-participant',
          final_seq: null,
          capture_closed_at: null,
        }))
      )
    );

    const result = await getTrackChunkRecoveryService({
      recordingId: 'rec-1',
      trackId: 'track-host',
      principal: { kind: 'guest', participantId: 'guest-participant', recordingId: 'rec-1' },
    });

    assert.equal(result.code, 'forbidden');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('recovery snapshot returns canonical nextExpectedSeq alongside nextSeq', async () => {
  const restores: Array<() => void> = [];

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
          final_seq: 3,
          capture_closed_at: new Date('2026-03-15T04:00:00.000Z'),
        }))
      )
    );
    restores.push(
      stubMethod(
        prisma.track_chunk,
        'findMany',
        (async () => [
          makeChunkRow({
            id: 'chunk-1',
            track_id: 'track-1',
            seq: 1,
            state: 'uploaded',
            storage_key_raw: 'recordings/rec-1/tracks/track-1/chunks/1.webm',
          }),
          makeChunkRow({
            id: 'chunk-2',
            track_id: 'track-1',
            seq: 2,
            state: 'uploading',
          }),
        ])
      )
    );

    const result = await getTrackChunkRecoveryService({
      recordingId: 'rec-1',
      trackId: 'track-1',
      principal: { kind: 'user', userId: 'owner-1' },
    });

    assert.equal(result.code, 'ok');
    assert.equal(result.data.recovery.highestExistingSeq, 2);
    assert.equal(result.data.recovery.highestContiguousUploadedSeq, 1);
    assert.equal(result.data.recovery.nextExpectedSeq, 3);
    assert.equal(result.data.recovery.nextSeq, 3);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
