import type { track_chunk_state } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

type UpsertTrackChunkArgs = {
  trackId: string;
  seq: number;
  protocol?: string;
  bytesExpected?: number;
  state?: track_chunk_state;
};

export async function upsertTrackChunk(args: UpsertTrackChunkArgs) {
  return prisma.track_chunk.upsert({
    where: {
      track_id_seq: {
        track_id: args.trackId,
        seq: args.seq,
      },
    },
    create: {
      track_id: args.trackId,
      seq: args.seq,
      protocol: args.protocol ?? null,
      bytes_expected: args.bytesExpected != null ? BigInt(args.bytesExpected) : null,
      state: args.state ?? 'initiated',
    },
    update: {
      protocol: args.protocol ?? undefined,
      bytes_expected: args.bytesExpected != null ? BigInt(args.bytesExpected) : undefined,
      state: args.state ?? undefined,
    },
  });
}

export async function getTrackChunkByTrackSeq(trackId: string, seq: number) {
  return prisma.track_chunk.findUnique({
    where: {
      track_id_seq: {
        track_id: trackId,
        seq,
      },
    },
  });
}

export async function listTrackChunksByTrack(trackId: string) {
  return prisma.track_chunk.findMany({
    where: { track_id: trackId },
    orderBy: { seq: 'asc' },
  });
}

export async function getTrackChunkById(chunkId: string) {
  return prisma.track_chunk.findUnique({
    where: { id: chunkId },
    include: {
      track: {
        select: {
          id: true,
          recording_id: true,
          participant_id: true,
        },
      },
    },
  });
}

export async function getMaxTrackChunkSeq(trackId: string): Promise<number | null> {
  const agg = await prisma.track_chunk.aggregate({
    where: { track_id: trackId },
    _max: { seq: true },
  });
  return agg._max.seq ?? null;
}

export async function hasIncompletePreviousChunk(trackId: string, seq: number): Promise<boolean> {
  const count = await prisma.track_chunk.count({
    where: {
      track_id: trackId,
      seq: { lt: seq },
      state: { not: 'uploaded' },
    },
  });
  return count > 0;
}

export async function markTrackChunkUploaded(args: {
  chunkId: string;
  bytesReceived?: number;
  bytesExpected?: number;
  storageKeyRaw?: string;
  etag?: string;
  checksumSha256?: string;
}) {
  return prisma.track_chunk.update({
    where: { id: args.chunkId },
    data: {
      state: 'uploaded',
      bytes_received: args.bytesReceived != null ? BigInt(args.bytesReceived) : undefined,
      bytes_expected: args.bytesExpected != null ? BigInt(args.bytesExpected) : undefined,
      storage_key_raw: args.storageKeyRaw ?? undefined,
      tus_upload_state: 'completed',
      failure_reason: null,
      last_error_at: null,
      materialized_at: new Date(),
      etag: args.etag ?? undefined,
      checksum_sha256: args.checksumSha256 ?? undefined,
    },
  });
}

export async function markTrackChunkUploading(args: {
  chunkId: string;
  tusId?: string;
  tusResourceUrl?: string;
  tusUploadState?: string;
  bytesExpected?: number;
  bytesReceived?: number;
}) {
  const existing = await prisma.track_chunk.findUnique({
    where: { id: args.chunkId },
    select: { state: true, tus_upload_state: true },
  });

  if (existing?.state === 'uploaded') {
    return prisma.track_chunk.findUnique({ where: { id: args.chunkId } });
  }

  const nextTusUploadState =
    existing?.tus_upload_state === 'completed'
      ? 'completed'
      : (args.tusUploadState ?? 'uploading');

  return prisma.track_chunk.update({
    where: { id: args.chunkId },
    data: {
      state: 'uploading',
      tus_upload_id: args.tusId ?? undefined,
      tus_resource_url: args.tusResourceUrl ?? undefined,
      tus_upload_state: nextTusUploadState,
      bytes_expected: args.bytesExpected != null ? BigInt(args.bytesExpected) : undefined,
      bytes_received: args.bytesReceived != null ? BigInt(args.bytesReceived) : undefined,
      failure_reason: null,
      last_error_at: null,
    },
  });
}

export async function markTrackChunkFailed(args: {
  chunkId: string;
  reason: string;
  bytesReceived?: number;
  tusUploadState?: string;
}) {
  const existing = await prisma.track_chunk.findUnique({
    where: { id: args.chunkId },
    select: { state: true },
  });
  if (existing?.state === 'uploaded') {
    return prisma.track_chunk.findUnique({ where: { id: args.chunkId } });
  }

  return prisma.track_chunk.update({
    where: { id: args.chunkId },
    data: {
      state: 'failed',
      failure_reason: args.reason.slice(0, 1000),
      last_error_at: new Date(),
      tus_upload_state: args.tusUploadState ?? 'failed',
      bytes_received: args.bytesReceived != null ? BigInt(args.bytesReceived) : undefined,
    },
  });
}

export async function setTrackChunkTusRef(args: {
  chunkId: string;
  tusId: string;
  tusResourceUrl?: string;
  tusUploadState?: string;
  bytesExpected?: number;
  bytesReceived?: number;
}) {
  return markTrackChunkUploading({
    chunkId: args.chunkId,
    tusId: args.tusId,
    tusResourceUrl: args.tusResourceUrl,
    tusUploadState: args.tusUploadState ?? 'created',
    bytesExpected: args.bytesExpected,
    bytesReceived: args.bytesReceived,
  });
}
