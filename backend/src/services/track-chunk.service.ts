import type { CompleteTrackChunkBody, CompleteTrackChunkResponse } from '../dto/chunks/complete.dto.js';
import type { InitiateTrackChunkBody, InitiateTrackChunkResponse } from '../dto/chunks/initiate.dto.js';
import type { TrackChunkRecoveryResponse } from '../dto/chunks/recovery.dto.js';
import {
  getTrackChunkById,
  getTrackChunkByTrackSeq,
  listTrackChunksByTrack,
  markTrackChunkUploaded,
} from '../repositories/track-chunk.repo.js';
import { prisma } from '../lib/prisma.js';
import { maybeEnqueueStitchJobForTrack, maybeMarkRecordingProcessing } from './recording-pipeline.service.js';
import type { RequestPrincipal } from '../lib/request-principal.js';
import { emitTelemetry } from '../lib/telemetry.js';
import { evaluateTrackUploadCompleteness } from './track-contiguity.service.js';
import { r2Adapter } from '../lib/r2.js';

// Presigned PUT URLs expire after 60 minutes — long enough for slow connections.

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'invalid_track' }
  | { code: 'invalid_protocol' }
  | { code: 'invalid_seq'; message: string; details?: Record<string, unknown> }
  | { code: 'seq_integrity_error'; message: string; details?: Record<string, unknown> };

type TrackChunkRecoveryRow = {
  id: string;
  seq: number;
  protocol: string | null;
  state: string;
  bytes_expected: bigint | null;
  bytes_received: bigint;
  failure_reason?: string | null;
  last_error_at?: Date | null;
  materialized_at?: Date | null;
  storage_key_raw?: string | null;
  updated_at: Date;
};

function toInitiateDto(row: {
  id: string;
  track_id: string;
  seq: number;
  protocol: string | null;
  state: string;
  bytes_received: bigint;
  bytes_expected: bigint | null;
  failure_reason: string | null;
  last_error_at: Date | null;
  materialized_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): InitiateTrackChunkResponse['chunk'] {
  return {
    id: row.id,
    trackId: row.track_id,
    seq: row.seq,
    protocol: row.protocol ?? undefined,
    state: row.state,
    bytesExpected: row.bytes_expected != null ? Number(row.bytes_expected) : undefined,
    bytesReceived: Number(row.bytes_received),
    failureReason: row.failure_reason ?? undefined,
    lastErrorAt: row.last_error_at?.toISOString(),
    materializedAt: row.materialized_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toCompleteDto(row: {
  id: string;
  track_id: string;
  seq: number;
  protocol: string | null;
  state: string;
  bytes_received: bigint;
  bytes_expected: bigint | null;
  failure_reason: string | null;
  last_error_at: Date | null;
  materialized_at: Date | null;
  storage_key_raw: string | null;
  etag: string | null;
  checksum_sha256: string | null;
  created_at: Date;
  updated_at: Date;
}): CompleteTrackChunkResponse['chunk'] {
  return {
    id: row.id,
    trackId: row.track_id,
    seq: row.seq,
    protocol: row.protocol ?? undefined,
    state: row.state,
    bytesReceived: Number(row.bytes_received),
    bytesExpected: row.bytes_expected != null ? Number(row.bytes_expected) : undefined,
    failureReason: row.failure_reason ?? undefined,
    lastErrorAt: row.last_error_at?.toISOString(),
    materializedAt: row.materialized_at?.toISOString(),
    storageKeyRaw: row.storage_key_raw ?? undefined,
    etag: row.etag ?? undefined,
    checksumSha256: row.checksum_sha256 ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function canAccessRecording(recordingId: string, principal: RequestPrincipal) {
  const rec = await prisma.recording.findUnique({
    where: { id: recordingId },
    select: { id: true, userId: true },
  });

  if (!rec) return { code: 'not_found' as const };
  if (principal.kind === 'user') {
    if (rec.userId && rec.userId !== principal.userId) return { code: 'forbidden' as const };
    return { code: 'ok' as const, scope: { kind: 'user' as const } };
  }

  if (principal.recordingId !== recordingId) return { code: 'forbidden' as const };
  return {
    code: 'ok' as const,
    scope: { kind: 'guest' as const, participantId: principal.participantId },
  };
}

async function getTrackSeqSnapshot(trackId: string): Promise<{
  highestExistingSeq: number;
  highestContiguousUploadedSeq: number;
  nextExpectedSeq: number;
  bySeq: Map<number, Awaited<ReturnType<typeof listTrackChunksByTrack>>[number]>;
}> {
  const chunks = await listTrackChunksByTrack(trackId);
  const bySeq = new Map<number, (typeof chunks)[number]>();
  for (const chunk of chunks) bySeq.set(chunk.seq, chunk);

  const highestExistingSeq = chunks.length > 0 ? chunks[chunks.length - 1]!.seq : 0;
  let highestContiguousUploadedSeq = 0;
  for (const chunk of chunks) {
    const expected = highestContiguousUploadedSeq + 1;
    if (chunk.seq !== expected) break;
    if (chunk.state !== 'uploaded') break;
    highestContiguousUploadedSeq = chunk.seq;
  }

  return {
    highestExistingSeq,
    highestContiguousUploadedSeq,
    nextExpectedSeq: highestExistingSeq + 1,
    bySeq,
  };
}

async function evaluateParticipantUploadCompletion(args: {
  recordingId: string;
  participantId: string;
}): Promise<{
  complete: boolean;
  tracksTotal: number;
  tracksComplete: number;
  blockedTrackIds: string[];
}> {
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidLike.test(args.recordingId) || !uuidLike.test(args.participantId)) {
    return { complete: false, tracksTotal: 0, tracksComplete: 0, blockedTrackIds: [] };
  }

  const tracks = await prisma.track.findMany({
    where: { recording_id: args.recordingId, participant_id: args.participantId },
    select: {
      id: true,
      final_seq: true,
      capture_closed_at: true,
      track_chunk: {
        orderBy: { seq: 'asc' },
        select: { seq: true, state: true, storage_key_raw: true },
      },
    },
  });

  if (tracks.length === 0) {
    return { complete: false, tracksTotal: 0, tracksComplete: 0, blockedTrackIds: [] };
  }

  let tracksComplete = 0;
  const blockedTrackIds: string[] = [];
  for (const track of tracks) {
    const completeness = evaluateTrackUploadCompleteness({
      captureClosedAt: track.capture_closed_at,
      finalSeq: track.final_seq,
      chunks: track.track_chunk,
    });
    if (completeness.complete) {
      tracksComplete += 1;
    } else {
      blockedTrackIds.push(track.id);
    }
  }

  return {
    complete: tracksComplete === tracks.length,
    tracksTotal: tracks.length,
    tracksComplete,
    blockedTrackIds,
  };
}

/**
 * Build the canonical R2 key for a chunk.
 * Pattern: recordings/<recordingId>/tracks/<trackId>/chunks/<seq>.webm
 */
function buildChunkKey(recordingId: string, trackId: string, seq: number): string {
  return `recordings/${recordingId}/tracks/${trackId}/chunks/${seq}.webm`;
}


export async function initiateTrackChunkService(args: {
  recordingId: string;
  principal: RequestPrincipal;
  body: InitiateTrackChunkBody;
}): Promise<ServiceResult<InitiateTrackChunkResponse>> {
  const acl = await canAccessRecording(args.recordingId, args.principal);
  if (acl.code !== 'ok') return { code: acl.code };

  if (args.body.protocol !== 'presigned_url') return { code: 'invalid_protocol' };
  if (!Number.isInteger(args.body.seq) || args.body.seq <= 0) {
    return { code: 'invalid_seq', message: 'seq must be a positive integer' };
  }

  const track = await prisma.track.findUnique({
    where: { id: args.body.trackId },
    select: { id: true, recording_id: true, participant_id: true, final_seq: true, capture_closed_at: true },
  });

  if (!track) return { code: 'invalid_track' };
  if (track.recording_id !== args.recordingId) return { code: 'invalid_track' };
  if (acl.scope.kind === 'guest' && track.participant_id !== acl.scope.participantId) {
    return { code: 'forbidden' };
  }

  const seqSnapshot = await getTrackSeqSnapshot(args.body.trackId);
  const existing = seqSnapshot.bySeq.get(args.body.seq) ?? (await getTrackChunkByTrackSeq(args.body.trackId, args.body.seq));

  if (existing) {
    // Already uploaded — skip re-upload.
    if (existing.state === 'uploaded') {
      return {
        code: 'ok',
        data: {
          status: 'existing',
          nextExpectedSeq: seqSnapshot.nextExpectedSeq,
          highestContiguousUploadedSeq: seqSnapshot.highestContiguousUploadedSeq,
          chunk: toInitiateDto(existing as any),
          existed: true,
          already: true,
        },
      };
    }

    // Not yet uploaded — return a fresh presigned URL for this chunk.
    const key = buildChunkKey(args.recordingId, args.body.trackId, args.body.seq);
    const { url, expiresAt } = await r2Adapter.presignPutUrl(key);
    return {
      code: 'ok',
      data: {
        status: 'existing',
        nextExpectedSeq: seqSnapshot.nextExpectedSeq,
        highestContiguousUploadedSeq: seqSnapshot.highestContiguousUploadedSeq,
        chunk: toInitiateDto(existing as any),
        existed: true,
        already: false,
        uploadPlan: { protocol: 'presigned_url', url, key, expiresAt },
      },
    };
  }

  if (args.body.seq !== seqSnapshot.nextExpectedSeq) {
    const reason = args.body.seq < seqSnapshot.nextExpectedSeq ? 'stale' : 'ahead';
    return {
      code: 'ok',
      data: {
        status: 'seq_mismatch',
        nextExpectedSeq: seqSnapshot.nextExpectedSeq,
        highestContiguousUploadedSeq: seqSnapshot.highestContiguousUploadedSeq,
        reconciliation: { requestedSeq: args.body.seq, reason },
      },
    };
  }

  let created: Awaited<ReturnType<typeof getTrackChunkByTrackSeq>>;
  try {
    created = await prisma.track_chunk.create({
      data: {
        track_id: args.body.trackId,
        seq: args.body.seq,
        protocol: args.body.protocol,
        bytes_expected: args.body.bytesExpected != null ? BigInt(args.body.bytesExpected) : null,
        state: 'initiated',
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const raced = await getTrackChunkByTrackSeq(args.body.trackId, args.body.seq);
      if (!raced) throw err;

      const refreshed = await getTrackSeqSnapshot(args.body.trackId);
      if (track.capture_closed_at && track.final_seq != null && args.body.seq > track.final_seq) {
        await prisma.track.update({ where: { id: args.body.trackId }, data: { final_seq: args.body.seq } });
      }

      if (raced.state === 'uploaded') {
        return {
          code: 'ok',
          data: {
            status: 'existing',
            nextExpectedSeq: refreshed.nextExpectedSeq,
            highestContiguousUploadedSeq: refreshed.highestContiguousUploadedSeq,
            chunk: toInitiateDto(raced as any),
            existed: true,
            already: true,
          },
        };
      }

      const key = buildChunkKey(args.recordingId, args.body.trackId, args.body.seq);
      const { url, expiresAt } = await r2Adapter.presignPutUrl(key);
      return {
        code: 'ok',
        data: {
          status: 'existing',
          nextExpectedSeq: refreshed.nextExpectedSeq,
          highestContiguousUploadedSeq: refreshed.highestContiguousUploadedSeq,
          chunk: toInitiateDto(raced as any),
          existed: true,
          already: false,
          uploadPlan: { protocol: 'presigned_url', url, key, expiresAt },
        },
      };
    }
    throw err;
  }

  if (!created) {
    return { code: 'seq_integrity_error', message: 'Failed to create chunk initiate row.' };
  }

  if (track.capture_closed_at && track.final_seq != null && args.body.seq > track.final_seq) {
    await prisma.track.update({ where: { id: args.body.trackId }, data: { final_seq: args.body.seq } });
  }

  const key = buildChunkKey(args.recordingId, args.body.trackId, args.body.seq);
  const { url, expiresAt } = await r2Adapter.presignPutUrl(key);

  return {
    code: 'ok',
    data: {
      status: 'accepted',
      nextExpectedSeq: args.body.seq + 1,
      highestContiguousUploadedSeq: seqSnapshot.highestContiguousUploadedSeq,
      chunk: toInitiateDto(created as any),
      existed: false,
      uploadPlan: { protocol: 'presigned_url', url, key, expiresAt },
    },
  };
}

export async function getTrackChunkRecoveryService(args: {
  recordingId: string;
  trackId: string;
  principal: RequestPrincipal;
}): Promise<ServiceResult<TrackChunkRecoveryResponse>> {
  const acl = await canAccessRecording(args.recordingId, args.principal);
  if (acl.code !== 'ok') return { code: acl.code };

  const track = await prisma.track.findUnique({
    where: { id: args.trackId },
    select: { id: true, recording_id: true, participant_id: true, final_seq: true, capture_closed_at: true },
  });

  if (!track || track.recording_id !== args.recordingId) return { code: 'invalid_track' };
  if (acl.scope.kind === 'guest' && track.participant_id !== acl.scope.participantId) {
    return { code: 'forbidden' };
  }

  const chunks = (await listTrackChunksByTrack(track.id)) as TrackChunkRecoveryRow[];
  const highestExistingSeq = chunks.length > 0 ? chunks[chunks.length - 1]!.seq : 0;

  let highestContiguousUploadedSeq = 0;
  for (const chunk of chunks) {
    const expected = highestContiguousUploadedSeq + 1;
    if (chunk.seq !== expected) break;
    if (chunk.state !== 'uploaded') break;
    highestContiguousUploadedSeq = chunk.seq;
  }

  const incompleteChunks = chunks
    .filter((chunk) => chunk.state !== 'uploaded')
    .map((chunk) => ({
      id: chunk.id,
      seq: chunk.seq,
      protocol: chunk.protocol ?? undefined,
      state: chunk.state,
      bytesExpected: chunk.bytes_expected != null ? Number(chunk.bytes_expected) : undefined,
      bytesReceived: Number(chunk.bytes_received),
      failureReason: chunk.failure_reason ?? undefined,
      lastErrorAt: chunk.last_error_at?.toISOString(),
      updatedAt: chunk.updated_at.toISOString(),
    }));

  emitTelemetry({
    event: 'upload.recovery.snapshot',
    message: 'Computed upload recovery snapshot',
    recordingId: args.recordingId,
    participantId: track.participant_id,
    trackId: track.id,
    highestExistingSeq,
    highestContiguousUploadedSeq,
    nextSeq: highestExistingSeq + 1,
    incompleteChunkCount: incompleteChunks.length,
  });

  return {
    code: 'ok',
    data: {
      track: {
        id: track.id,
        recordingId: track.recording_id,
        finalized: !!track.capture_closed_at && track.final_seq != null,
      },
      recovery: {
        highestExistingSeq,
        highestContiguousUploadedSeq,
        nextExpectedSeq: highestExistingSeq + 1,
        nextSeq: highestExistingSeq + 1,
        incompleteChunks,
      },
    },
  };
}

export async function completeTrackChunkService(args: {
  recordingId: string;
  chunkId: string;
  principal: RequestPrincipal;
  body: CompleteTrackChunkBody;
}): Promise<ServiceResult<CompleteTrackChunkResponse>> {
  const acl = await canAccessRecording(args.recordingId, args.principal);
  if (acl.code !== 'ok') return { code: acl.code };

  if (args.body.protocol !== 'presigned_url') return { code: 'invalid_protocol' };

  const chunk = await getTrackChunkById(args.chunkId);
  if (!chunk) return { code: 'not_found' };
  if (chunk.track.recording_id !== args.recordingId) return { code: 'invalid_track' };
  if (acl.scope.kind === 'guest' && chunk.track.participant_id !== acl.scope.participantId) {
    return { code: 'forbidden' };
  }

  if (chunk.state === 'uploaded') {
    const seqSnapshot = await getTrackSeqSnapshot(chunk.track_id);
    emitTelemetry({
      event: 'upload.chunk.completed',
      message: 'Chunk complete acknowledged as already uploaded',
      recordingId: args.recordingId,
      participantId: chunk.track.participant_id,
      trackId: chunk.track_id,
      chunkId: chunk.id,
      seq: chunk.seq,
      protocol: 'presigned_url',
      already: true,
      nextExpectedSeq: seqSnapshot.nextExpectedSeq,
      highestContiguousUploadedSeq: seqSnapshot.highestContiguousUploadedSeq,
    });
    return {
      code: 'ok',
      data: {
        chunk: toCompleteDto(chunk as any),
        already: true,
        nextExpectedSeq: seqSnapshot.nextExpectedSeq,
        highestContiguousUploadedSeq: seqSnapshot.highestContiguousUploadedSeq,
      },
    };
  }

  // Presigned URL flow: browser PUT directly to R2, sends us back the key + bytes.
  const storageKeyRaw = args.body.storageKeyRaw;
  const bytesReceived = args.body.bytesReceived;

  if (!storageKeyRaw) {
    return {
      code: 'seq_integrity_error',
      message: 'Complete request for presigned_url protocol must include storageKeyRaw.',
      details: { chunkId: args.chunkId },
    };
  }

  const updated = await markTrackChunkUploaded({
    chunkId: args.chunkId,
    bytesReceived,
    bytesExpected: chunk.bytes_expected != null ? Number(chunk.bytes_expected) : undefined,
    storageKeyRaw,
    etag: args.body.etag,
    checksumSha256: args.body.checksumSha256,
  });

  await maybeEnqueueStitchJobForTrack(args.recordingId, chunk.track_id);
  await maybeMarkRecordingProcessing(args.recordingId);

  const seqSnapshot = await getTrackSeqSnapshot(chunk.track_id);
  emitTelemetry({
    event: 'upload.chunk.completed',
    message: 'Chunk marked uploaded',
    recordingId: args.recordingId,
    participantId: chunk.track.participant_id,
    trackId: chunk.track_id,
    chunkId: chunk.id,
    seq: chunk.seq,
    protocol: 'presigned_url',
    already: false,
    nextExpectedSeq: seqSnapshot.nextExpectedSeq,
    highestContiguousUploadedSeq: seqSnapshot.highestContiguousUploadedSeq,
  });

  const participantCompletion = await evaluateParticipantUploadCompletion({
    recordingId: args.recordingId,
    participantId: chunk.track.participant_id,
  });
  if (participantCompletion.complete) {
    emitTelemetry({
      event: 'upload.participant.completed',
      message: 'Participant uploads are fully complete',
      recordingId: args.recordingId,
      participantId: chunk.track.participant_id,
      trackId: chunk.track_id,
      chunkId: chunk.id,
      tracksTotal: participantCompletion.tracksTotal,
      tracksComplete: participantCompletion.tracksComplete,
    });
  }

  return {
    code: 'ok',
    data: {
      chunk: toCompleteDto(updated as any),
      nextExpectedSeq: seqSnapshot.nextExpectedSeq,
      highestContiguousUploadedSeq: seqSnapshot.highestContiguousUploadedSeq,
    },
  };
}
