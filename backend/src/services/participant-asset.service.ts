import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { emitTelemetry } from '../lib/telemetry.js';

export type ParticipantAssetPayload = {
  id: string;
  recordingId: string;
  participantId: string;
  participantRole?: string;
  participantName?: string;
  participantEmail?: string;
  state: 'pending' | 'processing' | 'ready' | 'failed';
  storageKey?: string;
  previewKey?: string;
  durationMs?: number;
  resolution?: string;
  readyAt?: string;
  processingStartedAt?: string;
  failedAt?: string;
  failureReason?: string;
  exportSet: string[];
  metadata?: Record<string, unknown>;
};

function normalizeJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function normalizeStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export async function markParticipantAssetProcessing(args: {
  recordingId: string;
  participantId: string;
}) {
  const now = new Date();
  return prisma.participant_asset.upsert({
    where: {
      recording_id_participant_id: {
        recording_id: args.recordingId,
        participant_id: args.participantId,
      },
    },
    create: {
      recording_id: args.recordingId,
      participant_id: args.participantId,
      state: 'processing',
      processing_started_at: now,
      export_set_json: [],
    },
    update: {
      state: 'processing',
      processing_started_at: now,
      failed_at: null,
      failure_reason: null,
    },
  });
}

export async function markParticipantAssetReady(args: {
  recordingId: string;
  participantId: string;
  storageKey: string;
  previewKey?: string;
  durationMs?: number;
  resolution?: string;
  metadata?: Record<string, unknown>;
  exportSet?: string[];
}) {
  const now = new Date();
  const row = await prisma.participant_asset.upsert({
    where: {
      recording_id_participant_id: {
        recording_id: args.recordingId,
        participant_id: args.participantId,
      },
    },
    create: {
      recording_id: args.recordingId,
      participant_id: args.participantId,
      state: 'ready',
      storage_key: args.storageKey,
      preview_key: args.previewKey ?? args.storageKey,
      duration_ms: args.durationMs ?? null,
      resolution: args.resolution ?? null,
      metadata_json: (args.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      export_set_json: args.exportSet ?? [],
      processing_started_at: now,
      ready_at: now,
      failed_at: null,
      failure_reason: null,
    },
    update: {
      state: 'ready',
      storage_key: args.storageKey,
      preview_key: args.previewKey ?? args.storageKey,
      duration_ms: args.durationMs ?? null,
      resolution: args.resolution ?? null,
      metadata_json: (args.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      export_set_json: args.exportSet ?? [],
      ready_at: now,
      failed_at: null,
      failure_reason: null,
    },
  });
  emitTelemetry({
    event: 'asset.participant.ready',
    message: 'Participant asset marked ready',
    recordingId: args.recordingId,
    participantId: args.participantId,
    assetId: row.id,
    storageKey: args.storageKey,
    previewKey: args.previewKey ?? args.storageKey,
    durationMs: args.durationMs,
    resolution: args.resolution,
  });
  return row;
}

export async function markParticipantAssetFailed(args: {
  recordingId: string;
  participantId: string;
  reason: string;
}) {
  const now = new Date();
  const row = await prisma.participant_asset.upsert({
    where: {
      recording_id_participant_id: {
        recording_id: args.recordingId,
        participant_id: args.participantId,
      },
    },
    create: {
      recording_id: args.recordingId,
      participant_id: args.participantId,
      state: 'failed',
      failed_at: now,
      failure_reason: args.reason.slice(0, 1000),
      processing_started_at: now,
      export_set_json: [],
    },
    update: {
      state: 'failed',
      failed_at: now,
      failure_reason: args.reason.slice(0, 1000),
    },
  });
  emitTelemetry({
    level: 'error',
    event: 'asset.participant.failed',
    message: 'Participant asset marked failed',
    recordingId: args.recordingId,
    participantId: args.participantId,
    assetId: row.id,
    reason: args.reason.slice(0, 1000),
  });
  return row;
}

export async function listParticipantAssetsForRecording(recordingId: string): Promise<ParticipantAssetPayload[]> {
  const rows = await prisma.participant_asset.findMany({
    where: { recording_id: recordingId },
    orderBy: [
      { participant_id: 'asc' },
      { updated_at: 'desc' },
    ],
    include: {
      participant: {
        select: {
          id: true,
          role: true,
          display_name: true,
          email: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    recordingId: row.recording_id,
    participantId: row.participant_id,
    participantRole: row.participant.role,
    participantName: row.participant.display_name ?? undefined,
    participantEmail: row.participant.email ?? undefined,
    state: row.state,
    storageKey: row.storage_key ?? undefined,
    previewKey: row.preview_key ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    resolution: row.resolution ?? undefined,
    processingStartedAt: row.processing_started_at?.toISOString(),
    readyAt: row.ready_at?.toISOString(),
    failedAt: row.failed_at?.toISOString(),
    failureReason: row.failure_reason ?? undefined,
    exportSet: normalizeStringArray(row.export_set_json as Prisma.JsonValue | null),
    metadata: normalizeJsonObject(row.metadata_json as Prisma.JsonValue | null),
  }));
}
