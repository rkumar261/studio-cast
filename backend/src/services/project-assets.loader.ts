import { prisma } from '../lib/prisma.js';

/**
 * Loads the raw recording asset graph required to build the project workspace response.
 * This stays query-focused so higher layers can evolve mapping without touching Prisma shape.
 */
export async function loadProjectAssetsRecording(recordingId: string) {
  return prisma.recording.findUnique({
    where: { id: recordingId },
    select: {
      id: true,
      title: true,
      status: true,
      userId: true,
      combined_asset: {
        orderBy: { updated_at: 'desc' },
        take: 1,
        select: {
          id: true,
          state: true,
          storage_key: true,
          preview_key: true,
          duration_ms: true,
          resolution: true,
          failure_reason: true,
          export_set_json: true,
          metadata_json: true,
        },
      },
      transcript: {
        orderBy: { updated_at: 'desc' },
        take: 1,
        select: {
          id: true,
          state: true,
          storage_key: true,
          language: true,
          failure_reason: true,
          metadata_json: true,
        },
      },
      export_artifact: {
        where: {
          type: { in: ['wav', 'mp4', 'mp4_captions'] },
          participant_asset_id: null,
        },
        orderBy: { updated_at: 'desc' },
        select: {
          id: true,
          type: true,
          state: true,
          updated_at: true,
          storage_key: true,
          last_error: true,
        },
      },
      participant: {
        select: {
          id: true,
          track: {
            where: { kind: 'video', storage_key_raw: { not: null } },
            orderBy: { created_at: 'asc' },
            take: 1,
            select: { storage_key_raw: true },
          },
        },
      },
    },
  });
}

export type LoadedProjectAssetsRecording = NonNullable<
  Awaited<ReturnType<typeof loadProjectAssetsRecording>>
>;
