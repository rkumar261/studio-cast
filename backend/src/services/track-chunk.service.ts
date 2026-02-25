import type { CompleteTrackChunkBody, CompleteTrackChunkResponse } from '../dto/chunks/complete.dto.js';
import type { InitiateTrackChunkBody, InitiateTrackChunkResponse } from '../dto/chunks/initiate.dto.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getMaxTrackChunkSeq,
  getTrackChunkById,
  getTrackChunkByTrackSeq,
  hasIncompletePreviousChunk,
  markTrackChunkUploaded,
  upsertTrackChunk,
} from '../repositories/track-chunk.repo.js';
import { prisma } from '../lib/prisma.js';
import { maybeEnqueueStitchJobForTrack, maybeMarkRecordingProcessing } from './recording-pipeline.service.js';

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'invalid_track' }
  | { code: 'invalid_protocol' }
  | { code: 'invalid_seq'; message: string }
  | { code: 'seq_integrity_error'; message: string };

function toInitiateDto(row: {
  id: string;
  track_id: string;
  seq: number;
  protocol: string | null;
  state: string;
  bytes_expected: bigint | null;
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

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function canManageRecording(recordingId: string, requesterId: string) {
  const rec = await prisma.recording.findUnique({
    where: { id: recordingId },
    select: { id: true, userId: true },
  });

  if (!rec) return { code: 'not_found' as const };
  if (rec.userId && rec.userId !== requesterId) return { code: 'forbidden' as const };
  return { code: 'ok' as const };
}

export async function initiateTrackChunkService(args: {
  recordingId: string;
  requesterId: string;
  body: InitiateTrackChunkBody;
}): Promise<ServiceResult<InitiateTrackChunkResponse>> {
  const acl = await canManageRecording(args.recordingId, args.requesterId);
  if (acl.code !== 'ok') return { code: acl.code };

  if (args.body.protocol !== 'tus' && args.body.protocol !== 'multipart') return { code: 'invalid_protocol' };
  if (!Number.isInteger(args.body.seq) || args.body.seq <= 0) {
    return { code: 'invalid_seq', message: 'seq must be a positive integer' };
  }

  const track = await prisma.track.findUnique({
    where: { id: args.body.trackId },
    select: { id: true, recording_id: true },
  });

  if (!track) return { code: 'invalid_track' };
  if (track.recording_id !== args.recordingId) return { code: 'invalid_track' };

  const existing = await getTrackChunkByTrackSeq(args.body.trackId, args.body.seq);
  if (existing) {
    if (existing.protocol && existing.protocol !== args.body.protocol) {
      return {
        code: 'invalid_protocol',
      };
    }
    return {
      code: 'ok',
      data: {
        chunk: toInitiateDto(existing as any),
        existed: true,
        ...(args.body.protocol === 'tus'
          ? {
              uploadPlan: {
                protocol: 'tus',
                tusEndpoint: normalizeTusEndpoint(process.env.UPLOAD_TUS_BASE_URL),
                metadata: {
                  chunkId: existing.id,
                  recordingId: args.recordingId,
                  trackId: args.body.trackId,
                  seq: String(args.body.seq),
                },
              },
            }
          : {}),
      },
    };
  }

  const maxSeq = await getMaxTrackChunkSeq(args.body.trackId);
  const expectedNext = (maxSeq ?? 0) + 1;
  if (args.body.seq !== expectedNext) {
    return {
      code: 'seq_integrity_error',
      message: `Expected next seq ${expectedNext}, got ${args.body.seq}`,
    };
  }

  const created = await upsertTrackChunk({
    trackId: args.body.trackId,
    seq: args.body.seq,
    protocol: args.body.protocol,
    bytesExpected: args.body.bytesExpected,
    state: 'initiated',
  });

  return {
    code: 'ok',
    data: {
      chunk: toInitiateDto(created as any),
      existed: false,
      ...(args.body.protocol === 'tus'
        ? {
            uploadPlan: {
              protocol: 'tus',
              tusEndpoint: normalizeTusEndpoint(process.env.UPLOAD_TUS_BASE_URL),
              metadata: {
                chunkId: created.id,
                recordingId: args.recordingId,
                trackId: args.body.trackId,
                seq: String(args.body.seq),
              },
            },
          }
        : {}),
    },
  };
}

export async function completeTrackChunkService(args: {
  recordingId: string;
  chunkId: string;
  requesterId: string;
  body: CompleteTrackChunkBody;
}): Promise<ServiceResult<CompleteTrackChunkResponse>> {
  const acl = await canManageRecording(args.recordingId, args.requesterId);
  if (acl.code !== 'ok') return { code: acl.code };

  if (args.body.protocol !== 'tus' && args.body.protocol !== 'multipart') return { code: 'invalid_protocol' };

  const chunk = await getTrackChunkById(args.chunkId);
  if (!chunk) return { code: 'not_found' };
  if (chunk.track.recording_id !== args.recordingId) return { code: 'invalid_track' };
  if (chunk.protocol && chunk.protocol !== args.body.protocol) return { code: 'invalid_protocol' };

  if (chunk.state === 'uploaded') {
    return {
      code: 'ok',
      data: {
        chunk: toCompleteDto(chunk as any),
        already: true,
      },
    };
  }

  const hasPrevIncomplete = await hasIncompletePreviousChunk(chunk.track_id, chunk.seq);
  if (hasPrevIncomplete) {
    return {
      code: 'seq_integrity_error',
      message: 'Previous chunks are not fully uploaded yet',
    };
  }

  let bytesReceived = args.body.bytesReceived;
  let storageKeyRaw = args.body.storageKeyRaw;

  if (args.body.protocol === 'tus' && (!storageKeyRaw || bytesReceived == null)) {
    const mediaRoot = process.env.MEDIA_ROOT;
    const tusUploadDir = process.env.TUSD_UPLOAD_DIR;
    if (!mediaRoot || !tusUploadDir) {
      return {
        code: 'seq_integrity_error',
        message: 'Chunk upload environment is not configured (MEDIA_ROOT/TUSD_UPLOAD_DIR).',
      };
    }

    const tusRefFromChunk = chunk.storage_key_raw?.startsWith('tus-id:')
      ? chunk.storage_key_raw.slice('tus-id:'.length)
      : null;
    const tusId = parseTusIdFromUrl(args.body.tusUrl) ?? tusRefFromChunk;
    const tusFiles = await resolveTusFiles({
      tusUploadDir,
      tusId,
      chunkId: args.chunkId,
    });

    if (!tusFiles) {
      return {
        code: 'seq_integrity_error',
        message: 'Chunk data not found in tus storage.',
      };
    }

    const sourcePath = tusFiles.dataPath;
    const ext = path.extname(sourcePath) || '.webm';
    const relativeKey = `recordings/${args.recordingId}/tracks/${chunk.track_id}/chunks/${chunk.seq}${ext}`;
    const destination = path.join(mediaRoot, relativeKey);
    await ensureDir(path.dirname(destination));

    try {
      await fs.rename(sourcePath, destination);
    } catch {
      await fs.copyFile(sourcePath, destination);
      await fs.unlink(sourcePath).catch(() => {});
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
    storageKeyRaw,
    etag: args.body.etag,
    checksumSha256: args.body.checksumSha256,
  });

  await maybeEnqueueStitchJobForTrack(args.recordingId, chunk.track_id);
  await maybeMarkRecordingProcessing(args.recordingId);

  return {
    code: 'ok',
    data: {
      chunk: toCompleteDto(updated as any),
    },
  };
}
