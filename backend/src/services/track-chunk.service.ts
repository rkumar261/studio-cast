import type { CompleteTrackChunkBody, CompleteTrackChunkResponse } from '../dto/chunks/complete.dto.js';
import type { InitiateTrackChunkBody, InitiateTrackChunkResponse } from '../dto/chunks/initiate.dto.js';
import type { TrackChunkRecoveryResponse } from '../dto/chunks/recovery.dto.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getTrackChunkById,
  getTrackChunkByTrackSeq,
  listTrackChunksByTrack,
  markTrackChunkFailed,
  markTrackChunkUploaded,
  setTrackChunkTusRef,
} from '../repositories/track-chunk.repo.js';
import { prisma } from '../lib/prisma.js';
import { maybeEnqueueStitchJobForTrack, maybeMarkRecordingProcessing } from './recording-pipeline.service.js';
import type { RequestPrincipal } from '../lib/request-principal.js';
import { type TusStorageContract, validateTusStorageContractFromEnv } from '../lib/tus-storage-contract.js';
import { emitTelemetry } from '../lib/telemetry.js';
import { evaluateTrackUploadCompleteness } from './track-contiguity.service.js';

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'invalid_track' }
  | { code: 'invalid_protocol' }
  | { code: 'invalid_seq'; message: string; details?: Record<string, unknown> }
  | { code: 'seq_integrity_error'; message: string; details?: Record<string, unknown> }
  | { code: 'tus_not_uploaded_yet'; message: string; details?: Record<string, unknown> }
  | { code: 'tus_storage_misconfigured'; message: string; details?: Record<string, unknown> }
  | { code: 'tus_upload_orphaned'; message: string; details?: Record<string, unknown> };

type TrackChunkRecoveryRow = {
  id: string;
  seq: number;
  protocol: string | null;
  state: string;
  bytes_expected: bigint | null;
  bytes_received: bigint;
  tus_upload_id?: string | null;
  tus_resource_url?: string | null;
  tus_upload_state?: string | null;
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
  tus_upload_id: string | null;
  tus_resource_url: string | null;
  tus_upload_state: string | null;
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
    tusUploadId: row.tus_upload_id ?? undefined,
    tusResourceUrl: row.tus_resource_url ?? undefined,
    tusUploadState: row.tus_upload_state ?? undefined,
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
  tus_upload_id: string | null;
  tus_resource_url: string | null;
  tus_upload_state: string | null;
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
    tusUploadId: row.tus_upload_id ?? undefined,
    tusResourceUrl: row.tus_resource_url ?? undefined,
    tusUploadState: row.tus_upload_state ?? undefined,
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

function normalizeTusEndpoint(input?: string) {
  const raw = (input ?? '').trim();
  if (!raw) return 'http://localhost:8080/tus/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function tusUrlFromId(tusId?: string | null): string | undefined {
  if (!tusId) return undefined;
  return `${normalizeTusEndpoint(process.env.UPLOAD_TUS_BASE_URL)}${tusId}`;
}

function tusIdFromLegacyStorageKeyRaw(storageKeyRaw?: string | null): string | undefined {
  if (!storageKeyRaw) return undefined;
  if (!storageKeyRaw.startsWith('tus-id:')) return undefined;
  const tusId = storageKeyRaw.slice('tus-id:'.length).trim();
  return tusId || undefined;
}

function resolveTusIdentity(row: {
  tus_upload_id?: string | null;
  tus_resource_url?: string | null;
  tus_upload_state?: string | null;
  storage_key_raw?: string | null;
}) {
  const tusId = row.tus_upload_id ?? tusIdFromLegacyStorageKeyRaw(row.storage_key_raw);
  const tusUrl = row.tus_resource_url ?? tusUrlFromId(tusId);
  return {
    tusId: tusId ?? undefined,
    tusUrl: tusUrl ?? undefined,
    tusUploadState: row.tus_upload_state ?? undefined,
  };
}

function toTusUploadPlan(params: {
  chunkId: string;
  recordingId: string;
  trackId: string;
  seq: number;
}): NonNullable<InitiateTrackChunkResponse['uploadPlan']> {
  return {
    protocol: 'tus',
    tusEndpoint: normalizeTusEndpoint(process.env.UPLOAD_TUS_BASE_URL),
    metadata: {
      chunkId: params.chunkId,
      recordingId: params.recordingId,
      trackId: params.trackId,
      seq: String(params.seq),
    },
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

function parseTusIdFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const cleaned = url.split('?')[0]?.replace(/\/+$/, '');
    const maybeId = cleaned?.split('/').pop();
    return maybeId || null;
  } catch {
    return null;
  }
}

function decodeMaybeBase64(v?: string) {
  if (!v) return '';
  const trimmed = String(v).trim();
  const looksBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && trimmed.length % 4 === 0;
  if (!looksBase64) return trimmed;
  try {
    return Buffer.from(trimmed, 'base64').toString('utf8');
  } catch {
    return trimmed;
  }
}

async function exists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveTusFiles(args: {
  tusUploadDir: string;
  tusId?: string | null;
  chunkId: string;
}): Promise<{ dataPath: string; infoPath?: string } | null> {
  if (args.tusId) {
    const byId = path.join(args.tusUploadDir, args.tusId);
    if (await exists(byId)) {
      return {
        dataPath: byId,
        infoPath: path.join(args.tusUploadDir, `${args.tusId}.info`),
      };
    }
  }

  const entries = await fs.readdir(args.tusUploadDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.info')) continue;
    const infoPath = path.join(args.tusUploadDir, entry.name);
    try {
      const raw = await fs.readFile(infoPath, 'utf8');
      const json = JSON.parse(raw) as any;
      const meta = (json?.Upload?.MetaData ?? json?.MetaData ?? json?.metadata ?? {}) as Record<string, string>;
      const value = decodeMaybeBase64(meta['chunk-id'] ?? meta['chunk_id']);
      if (value !== args.chunkId) continue;
      const stem = entry.name.replace(/\.info$/, '');
      const dataPath = path.join(args.tusUploadDir, stem);
      if (await exists(dataPath)) {
        return {
          dataPath,
          infoPath,
        };
      }
    } catch {
      // ignore malformed hook info files
    }
  }

  return null;
}

async function readTusInfoMeta(infoPath: string): Promise<Record<string, string> | null> {
  try {
    const raw = await fs.readFile(infoPath, 'utf8');
    const json = JSON.parse(raw) as any;
    return (json?.Upload?.MetaData ?? json?.MetaData ?? json?.metadata ?? {}) as Record<string, string>;
  } catch {
    return null;
  }
}

function decodeChunkIdFromMeta(meta: Record<string, string> | null): string | null {
  if (!meta) return null;
  const value = decodeMaybeBase64(meta['chunk-id'] ?? meta['chunk_id']);
  return value || null;
}

async function resolveTusFilesByCanonicalIdentity(args: {
  contract: TusStorageContract;
  chunkId: string;
  tusId: string;
}): Promise<
  | { ok: true; dataPath: string; infoPath?: string }
  | { ok: false; code: 'tus_not_uploaded_yet' | 'tus_upload_orphaned'; message: string; details?: Record<string, unknown> }
> {
  const dataPath = path.join(args.contract.tusUploadDir, args.tusId);
  const infoPath = path.join(args.contract.tusUploadDir, `${args.tusId}.info`);
  const hasData = await exists(dataPath);
  const hasInfo = await exists(infoPath);

  if (hasData) {
    return { ok: true, dataPath, infoPath: hasInfo ? infoPath : undefined };
  }

  if (hasInfo) {
    const meta = await readTusInfoMeta(infoPath);
    const metaChunkId = decodeChunkIdFromMeta(meta);
    if (metaChunkId && metaChunkId !== args.chunkId) {
      return {
        ok: false,
        code: 'tus_upload_orphaned',
        message: 'Stored TUS upload identity points to a different chunk metadata record.',
        details: {
          storedTusId: args.tusId,
          expectedChunkId: args.chunkId,
          metadataChunkId: metaChunkId,
          infoPath,
        },
      };
    }
    return {
      ok: false,
      code: 'tus_not_uploaded_yet',
      message: 'TUS upload exists but data file is not materialized yet.',
      details: {
        storedTusId: args.tusId,
        chunkId: args.chunkId,
        dataPath,
        infoPath,
      },
    };
  }

  const fallback = await resolveTusFiles({
    tusUploadDir: args.contract.tusUploadDir,
    chunkId: args.chunkId,
  });
  if (fallback && path.basename(fallback.dataPath) !== args.tusId) {
    return {
      ok: false,
      code: 'tus_upload_orphaned',
      message: 'Chunk data exists under a different TUS identity than the stored canonical identity.',
      details: {
        storedTusId: args.tusId,
        detectedTusId: path.basename(fallback.dataPath),
        chunkId: args.chunkId,
      },
    };
  }

  return {
    ok: false,
    code: 'tus_not_uploaded_yet',
    message: 'No TUS temp files found for the stored upload identity.',
    details: {
      storedTusId: args.tusId,
      chunkId: args.chunkId,
      tusUploadDir: args.contract.tusUploadDir,
    },
  };
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
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
    return {
      complete: false,
      tracksTotal: 0,
      tracksComplete: 0,
      blockedTrackIds: [],
    };
  }

  const tracks = await prisma.track.findMany({
    where: {
      recording_id: args.recordingId,
      participant_id: args.participantId,
    },
    select: {
      id: true,
      final_seq: true,
      capture_closed_at: true,
      track_chunk: {
        orderBy: { seq: 'asc' },
        select: {
          seq: true,
          state: true,
          storage_key_raw: true,
        },
      },
    },
  });

  if (tracks.length === 0) {
    return {
      complete: false,
      tracksTotal: 0,
      tracksComplete: 0,
      blockedTrackIds: [],
    };
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
      continue;
    }
    blockedTrackIds.push(track.id);
  }

  return {
    complete: tracksComplete === tracks.length,
    tracksTotal: tracks.length,
    tracksComplete,
    blockedTrackIds,
  };
}

export async function initiateTrackChunkService(args: {
  recordingId: string;
  principal: RequestPrincipal;
  body: InitiateTrackChunkBody;
}): Promise<ServiceResult<InitiateTrackChunkResponse>> {
  const acl = await canAccessRecording(args.recordingId, args.principal);
  if (acl.code !== 'ok') return { code: acl.code };

  if (args.body.protocol !== 'tus' && args.body.protocol !== 'multipart') return { code: 'invalid_protocol' };
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
    if (existing.protocol && existing.protocol !== args.body.protocol) {
      return {
        code: 'invalid_protocol',
      };
    }
    const tusIdentity = resolveTusIdentity(existing);
    const canResumeTus = args.body.protocol === 'tus' && existing.state !== 'uploaded';
    return {
      code: 'ok',
      data: {
        status: 'existing',
        nextExpectedSeq: seqSnapshot.nextExpectedSeq,
        highestContiguousUploadedSeq: seqSnapshot.highestContiguousUploadedSeq,
        chunk: toInitiateDto(existing as any),
        existed: true,
        already: existing.state === 'uploaded',
        ...(args.body.protocol === 'tus'
          ? {
              uploadPlan: toTusUploadPlan({
                chunkId: existing.id,
                recordingId: args.recordingId,
                trackId: args.body.trackId,
                seq: args.body.seq,
              }),
              ...(canResumeTus
                ? {
                    resumeUploadPlan: {
                      protocol: 'tus' as const,
                      tusEndpoint: normalizeTusEndpoint(process.env.UPLOAD_TUS_BASE_URL),
                      chunkId: existing.id,
                      tusId: tusIdentity.tusId,
                      tusUrl: tusIdentity.tusUrl,
                      tusResourceUrl: tusIdentity.tusUrl,
                      tusUploadState: tusIdentity.tusUploadState,
                    },
                  }
                : {}),
            }
          : {}),
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
        reconciliation: {
          requestedSeq: args.body.seq,
          reason,
        },
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

      if (raced.protocol && raced.protocol !== args.body.protocol) {
        return {
          code: 'invalid_protocol',
        };
      }

      const refreshed = await getTrackSeqSnapshot(args.body.trackId);
      if (
        track.capture_closed_at &&
        track.final_seq != null &&
        args.body.seq > track.final_seq
      ) {
        await prisma.track.update({
          where: { id: args.body.trackId },
          data: { final_seq: args.body.seq },
        });
      }
      const tusIdentity = resolveTusIdentity(raced);
      const canResumeTus = args.body.protocol === 'tus' && raced.state !== 'uploaded';
      return {
        code: 'ok',
        data: {
          status: 'existing',
          nextExpectedSeq: refreshed.nextExpectedSeq,
          highestContiguousUploadedSeq: refreshed.highestContiguousUploadedSeq,
          chunk: toInitiateDto(raced as any),
          existed: true,
          already: raced.state === 'uploaded',
          ...(args.body.protocol === 'tus'
            ? {
                uploadPlan: toTusUploadPlan({
                  chunkId: raced.id,
                  recordingId: args.recordingId,
                  trackId: args.body.trackId,
                  seq: args.body.seq,
                }),
                ...(canResumeTus
                  ? {
                      resumeUploadPlan: {
                        protocol: 'tus' as const,
                        tusEndpoint: normalizeTusEndpoint(process.env.UPLOAD_TUS_BASE_URL),
                        chunkId: raced.id,
                        tusId: tusIdentity.tusId,
                        tusUrl: tusIdentity.tusUrl,
                        tusResourceUrl: tusIdentity.tusUrl,
                        tusUploadState: tusIdentity.tusUploadState,
                      },
                    }
                  : {}),
              }
            : {}),
        },
      };
    }
    throw err;
  }

  if (!created) {
    return {
      code: 'seq_integrity_error',
      message: 'Failed to create chunk initiate row.',
    };
  }

  if (
    track.capture_closed_at &&
    track.final_seq != null &&
    args.body.seq > track.final_seq
  ) {
    await prisma.track.update({
      where: { id: args.body.trackId },
      data: { final_seq: args.body.seq },
    });
  }

  return {
    code: 'ok',
    data: {
      status: 'accepted',
      nextExpectedSeq: args.body.seq + 1,
      highestContiguousUploadedSeq: seqSnapshot.highestContiguousUploadedSeq,
      chunk: toInitiateDto(created as any),
      existed: false,
      ...(args.body.protocol === 'tus'
        ? {
            uploadPlan: toTusUploadPlan({
              chunkId: created.id,
              recordingId: args.recordingId,
              trackId: args.body.trackId,
              seq: args.body.seq,
            }),
          }
        : {}),
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
    select: {
      id: true,
      recording_id: true,
      participant_id: true,
      final_seq: true,
      capture_closed_at: true,
    },
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
    .map((chunk) => {
      const tusIdentity = resolveTusIdentity(chunk);
      return {
        id: chunk.id,
        seq: chunk.seq,
        protocol: chunk.protocol ?? undefined,
        state: chunk.state,
        bytesExpected: chunk.bytes_expected != null ? Number(chunk.bytes_expected) : undefined,
        bytesReceived: Number(chunk.bytes_received),
        tusId: tusIdentity.tusId,
        tusUrl: tusIdentity.tusUrl,
        tusUploadState: tusIdentity.tusUploadState,
        failureReason: chunk.failure_reason ?? undefined,
        lastErrorAt: chunk.last_error_at?.toISOString(),
        updatedAt: chunk.updated_at.toISOString(),
      };
    });

  const resumable = incompleteChunks.find((chunk) => chunk.tusId);

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
    hasResumableTus: Boolean(resumable?.tusId),
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
        nextSeq: highestExistingSeq + 1,
        incompleteChunks,
        ...(resumable?.tusId
          ? {
              resumableTus: {
                chunkId: resumable.id,
                seq: resumable.seq,
                tusId: resumable.tusId,
                tusUrl: resumable.tusUrl,
                tusUploadState: resumable.tusUploadState,
              },
            }
          : {}),
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

  if (args.body.protocol !== 'tus' && args.body.protocol !== 'multipart') return { code: 'invalid_protocol' };

  const chunk = await getTrackChunkById(args.chunkId);
  if (!chunk) return { code: 'not_found' };
  if (chunk.track.recording_id !== args.recordingId) return { code: 'invalid_track' };
  if (acl.scope.kind === 'guest' && chunk.track.participant_id !== acl.scope.participantId) {
    return { code: 'forbidden' };
  }
  if (chunk.protocol && chunk.protocol !== args.body.protocol) return { code: 'invalid_protocol' };

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
      protocol: chunk.protocol ?? args.body.protocol,
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

  let bytesReceived = args.body.bytesReceived;
  let storageKeyRaw = args.body.storageKeyRaw;
  const parsedTusIdFromBody = args.body.protocol === 'tus' ? parseTusIdFromUrl(args.body.tusUrl) : null;

  if (args.body.protocol === 'tus' && (!storageKeyRaw || bytesReceived == null)) {
    const contractValidation = await validateTusStorageContractFromEnv();
    if (!contractValidation.ok) {
      emitTelemetry({
        level: 'error',
        event: 'upload.chunk.failed',
        message: 'Chunk completion failed due to TUS storage misconfiguration',
        recordingId: args.recordingId,
        participantId: chunk.track.participant_id,
        trackId: chunk.track_id,
        chunkId: chunk.id,
        reason: 'tus_storage_misconfigured',
        details: contractValidation.details ?? undefined,
      });
      return {
        code: 'tus_storage_misconfigured',
        message: 'TUS storage contract is invalid.',
        details: {
          validationCode: contractValidation.code,
          ...contractValidation.details,
        },
      };
    }
    const contract = contractValidation.contract;

    const tusIdentity = resolveTusIdentity(chunk);
    let canonicalTusId = tusIdentity.tusId ?? null;
    if (!canonicalTusId && parsedTusIdFromBody) {
      canonicalTusId = parsedTusIdFromBody;
      await setTrackChunkTusRef({
        chunkId: args.chunkId,
        tusId: canonicalTusId,
        tusResourceUrl: args.body.tusUrl ?? tusUrlFromId(canonicalTusId),
        tusUploadState: 'uploading',
      });
    }

    if (!canonicalTusId) {
      emitTelemetry({
        level: 'warn',
        event: 'upload.chunk.failed',
        message: 'Chunk completion attempted before TUS upload identity is available',
        recordingId: args.recordingId,
        participantId: chunk.track.participant_id,
        trackId: chunk.track_id,
        chunkId: chunk.id,
        reason: 'tus_not_uploaded_yet',
        chunkState: chunk.state,
      });
      return {
        code: 'tus_not_uploaded_yet',
        message: 'Chunk does not have a persisted TUS upload identity yet.',
        details: {
          chunkId: args.chunkId,
          chunkState: chunk.state,
          tusUploadState: chunk.tus_upload_state ?? null,
        },
      };
    }

    await setTrackChunkTusRef({
      chunkId: args.chunkId,
      tusId: canonicalTusId,
      tusResourceUrl: args.body.tusUrl ?? tusIdentity.tusUrl ?? tusUrlFromId(canonicalTusId),
      tusUploadState: 'uploading',
      bytesExpected: chunk.bytes_expected != null ? Number(chunk.bytes_expected) : undefined,
      bytesReceived: chunk.bytes_received != null ? Number(chunk.bytes_received) : undefined,
    });

    if (parsedTusIdFromBody && parsedTusIdFromBody !== canonicalTusId) {
      await markTrackChunkFailed({
        chunkId: args.chunkId,
        reason: 'tus_identity_mismatch',
        tusUploadState: 'orphaned',
      });
      emitTelemetry({
        level: 'error',
        event: 'upload.chunk.failed',
        message: 'Chunk completion TUS identity mismatch',
        recordingId: args.recordingId,
        participantId: chunk.track.participant_id,
        trackId: chunk.track_id,
        chunkId: chunk.id,
        reason: 'tus_upload_orphaned',
        storedTusId: canonicalTusId,
        requestTusId: parsedTusIdFromBody,
      });
      return {
        code: 'tus_upload_orphaned',
        message: 'Complete request TUS URL does not match stored canonical TUS identity.',
        details: {
          chunkId: args.chunkId,
          storedTusId: canonicalTusId,
          requestTusId: parsedTusIdFromBody,
          tusUrl: args.body.tusUrl,
        },
      };
    }

    if (parsedTusIdFromBody && parsedTusIdFromBody === canonicalTusId && args.body.tusUrl) {
      await setTrackChunkTusRef({
        chunkId: args.chunkId,
        tusId: canonicalTusId,
        tusResourceUrl: args.body.tusUrl,
        tusUploadState: 'uploading',
        bytesExpected: chunk.bytes_expected != null ? Number(chunk.bytes_expected) : undefined,
        bytesReceived: chunk.bytes_received != null ? Number(chunk.bytes_received) : undefined,
      });
    }

    const tusFiles = await resolveTusFilesByCanonicalIdentity({
      contract,
      chunkId: args.chunkId,
      tusId: canonicalTusId,
    });

    if (!tusFiles.ok) {
      if (tusFiles.code === 'tus_upload_orphaned') {
        await markTrackChunkFailed({
          chunkId: args.chunkId,
          reason: 'tus_upload_orphaned',
          tusUploadState: 'orphaned',
        });
      }
      emitTelemetry({
        level: tusFiles.code === 'tus_upload_orphaned' ? 'error' : 'warn',
        event: 'upload.chunk.failed',
        message: 'Chunk completion could not resolve TUS materialized files',
        recordingId: args.recordingId,
        participantId: chunk.track.participant_id,
        trackId: chunk.track_id,
        chunkId: chunk.id,
        reason: tusFiles.code,
        details: tusFiles.details ?? undefined,
      });
      return {
        code: tusFiles.code,
        message: tusFiles.message,
        details: tusFiles.details,
      };
    }

    const sourcePath = tusFiles.dataPath;
    const ext = path.extname(sourcePath) || '.webm';
    const relativeKey = `recordings/${args.recordingId}/tracks/${chunk.track_id}/chunks/${chunk.seq}${ext}`;
    const destination = path.join(contract.mediaRoot, relativeKey);
    await ensureDir(path.dirname(destination));

    try {
      await fs.rename(sourcePath, destination);
    } catch {
      try {
        await fs.copyFile(sourcePath, destination);
        await fs.unlink(sourcePath).catch(() => {});
      } catch (copyErr) {
        await markTrackChunkFailed({
          chunkId: args.chunkId,
          reason: 'tus_materialization_io_error',
          tusUploadState: 'failed',
        });
        emitTelemetry({
          level: 'error',
          event: 'upload.chunk.failed',
          message: 'Chunk completion failed during media materialization',
          recordingId: args.recordingId,
          participantId: chunk.track.participant_id,
          trackId: chunk.track_id,
          chunkId: chunk.id,
          reason: 'tus_materialization_io_error',
          err: copyErr,
        });
        return {
          code: 'seq_integrity_error',
          message: 'Failed to materialize uploaded chunk into media storage.',
          details: {
            chunkId: args.chunkId,
            sourcePath,
            destination,
            error: String(copyErr),
          },
        };
      }
    }

    const written = await fs.stat(destination);
    bytesReceived = bytesReceived ?? Number(written.size);
    storageKeyRaw = storageKeyRaw ?? relativeKey;

    if (tusFiles.infoPath) {
      await fs.unlink(tusFiles.infoPath).catch(() => {});
    }
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
    protocol: args.body.protocol,
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
