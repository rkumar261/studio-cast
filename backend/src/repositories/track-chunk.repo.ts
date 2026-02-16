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
  storageKeyRaw?: string;
  etag?: string;
  checksumSha256?: string;
}) {
  return prisma.track_chunk.update({
    where: { id: args.chunkId },
    data: {
      state: 'uploaded',
      bytes_received: args.bytesReceived != null ? BigInt(args.bytesReceived) : undefined,
      storage_key_raw: args.storageKeyRaw ?? undefined,
      etag: args.etag ?? undefined,
      checksum_sha256: args.checksumSha256 ?? undefined,
    },
  });
}
