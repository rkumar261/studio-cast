import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';

function asJsonObject(v: Prisma.JsonValue | undefined): Prisma.JsonObject {
  return (v && typeof v === 'object' && !Array.isArray(v))
    ? (v as Prisma.JsonObject)
    : {};
}

export async function createTrackAndUpload(
  recordingId: string,
  participantId: string,
  kind: 'audio' | 'video' | 'screen',
  protocol: 'tus' | 'multipart'
) {
  return prisma.track.create({
    data: {
      participant_id: participantId,
      recording_id: recordingId,
      kind,
      state: 'recording',
      upload: {
        create: {
          protocol,
          state: 'in_progress',
          bytes_received: BigInt(0),
        }
      }
    },
    include: { upload: true }
  });
}

export async function completeUpload(uploadId: string) {

  return prisma.upload.update({
    where: { id: uploadId },
    data: {
      state: 'completed',
      track: {
        update: {
          state: 'uploaded'
        }
      }
    },
    include: { track: true }
  });
}


export async function getUploadWithTrack(uploadId: string) {
  return prisma.upload.findUnique({
    where: { id: uploadId },
    include: {
      track: true, // track has recording_id etc
    },
  });
}

/**
 * Idempotent: if already completed, returns existing row.
 */
export async function markUploadCompletedAndSetRawKey(uploadId: string, relKey: string) {
  // Use a transaction so state + key move together
  return prisma.$transaction(async (tx) => {
    const existing = await tx.upload.findUnique({
      where: { id: uploadId },
      include: { track: true },
    });
    if (!existing) return { code: 'not_found' as const };

    // Idempotency guard
    if (existing.state === 'completed' && existing.track?.storage_key_raw === relKey) {
      return { code: 'ok' as const, data: { upload: existing } };
    }

    const updated = await tx.upload.update({
      where: { id: uploadId },
      data: {
        state: 'completed',
        track: {
          update: {
            state: 'uploaded',
            storage_key_raw: relKey,
          },
        },
      },
      include: { track: true },
    });

    return { code: 'ok' as const, data: { upload: updated } };
  });
}

export async function saveTusMapping(params: { uploadId: string; tusId: string }) {
  const { uploadId, tusId } = params;
  // Upsert by uploadId; updatedAt auto-sets via @updatedAt
  await prisma.uploadTusMap.upsert({
    where: { uploadId },
    create: { uploadId, tusId },
    update: { tusId },
  });
}

export async function getTusIdByUploadId(uploadId: string): Promise<string | null> {
  const row = await prisma.uploadTusMap.findUnique({
    where: { uploadId },
    select: { tusId: true },
  });
  return row?.tusId ?? null;
}

export async function saveMultipartPlan(params: {
  uploadId: string;
  bucket: string;
  objectKey: string;
  multipartId: string;
  partSize: number;
  expectedSize: number;
  presignMeta?: { partNumber: number; size: number }[];
}) {
  const { uploadId, bucket, objectKey, multipartId, partSize, expectedSize, presignMeta
  } = params;

  const existing = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { parts_json: true },
  });

  const base = asJsonObject(existing?.parts_json);

  const mergedPartsJson: any = {
    ...base,
    plan: { partSize, totalParts: Math.ceil(expectedSize / partSize) },
    ...(presignMeta ? { presignMeta } : {}),
  };

  await prisma.upload.update({
    where: { id: uploadId },
    data: {
      storage_bucket: bucket,
      object_key: objectKey,
      multipart_id: multipartId,
      part_size: partSize,
      expected_size: BigInt(expectedSize),
      parts_json: mergedPartsJson,        // <— now a JsonObject
      state: 'in_progress',
    },
  })
}
