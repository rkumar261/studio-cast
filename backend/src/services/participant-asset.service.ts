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

export type ParticipantMasterBlockedReason =
  | 'waiting_for_participant_media'
  | 'building_participant_master'
  | 'participant_master_pending_publish'
  | 'participant_master_failed';

export type ParticipantMasterStatus = {
  participantId: string;
  participantRole: string;
  participantName?: string;
  participantEmail?: string;
  isApplicable: boolean;
  state: 'missing' | 'pending' | 'processing' | 'ready' | 'failed';
  blockedReason?: ParticipantMasterBlockedReason;
  failureReason?: string;
  masterTrackId?: string;
  masterTrackKind?: 'audio' | 'video' | 'screen';
  asset?: ParticipantAssetPayload;
};

type ParticipantTrackRow = {
  id: string;
  kind: 'audio' | 'video' | 'screen';
  state: 'recording' | 'uploaded' | 'processed';
  storage_key_final: string | null;
  duration_ms: number | null;
  created_at: Date;
};

const PARTICIPANT_MASTER_KIND_PRIORITY: Record<ParticipantTrackRow['kind'], number> = {
  video: 0,
  screen: 1,
  audio: 2,
};

function normalizeJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function normalizeStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function toParticipantAssetPayload(row: {
  id: string;
  recording_id: string;
  participant_id: string;
  state: 'pending' | 'processing' | 'ready' | 'failed';
  storage_key: string | null;
  preview_key: string | null;
  duration_ms: number | null;
  resolution: string | null;
  processing_started_at: Date | null;
  ready_at: Date | null;
  failed_at: Date | null;
  failure_reason: string | null;
  export_set_json: Prisma.JsonValue | null;
  metadata_json: Prisma.JsonValue | null;
  participant?: {
    role: string;
    display_name: string | null;
    email: string | null;
  };
}): ParticipantAssetPayload {
  return {
    id: row.id,
    recordingId: row.recording_id,
    participantId: row.participant_id,
    participantRole: row.participant?.role,
    participantName: row.participant?.display_name ?? undefined,
    participantEmail: row.participant?.email ?? undefined,
    state: row.state,
    storageKey: row.storage_key ?? undefined,
    previewKey: row.preview_key ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    resolution: row.resolution ?? undefined,
    processingStartedAt: row.processing_started_at?.toISOString(),
    readyAt: row.ready_at?.toISOString(),
    failedAt: row.failed_at?.toISOString(),
    failureReason: row.failure_reason ?? undefined,
    exportSet: normalizeStringArray(row.export_set_json),
    metadata: normalizeJsonObject(row.metadata_json),
  };
}

export function selectParticipantMasterTrack<T extends Pick<ParticipantTrackRow, 'id' | 'kind' | 'created_at'>>(
  tracks: T[]
): T | undefined {
  return [...tracks].sort((left, right) => {
    const priorityDiff =
      PARTICIPANT_MASTER_KIND_PRIORITY[left.kind] - PARTICIPANT_MASTER_KIND_PRIORITY[right.kind];
    if (priorityDiff !== 0) return priorityDiff;
    const createdDiff = left.created_at.getTime() - right.created_at.getTime();
    if (createdDiff !== 0) return createdDiff;
    return left.id.localeCompare(right.id);
  })[0];
}

function deriveParticipantMasterState(args: {
  hasTracks: boolean;
  masterTrack?: ParticipantTrackRow;
  asset?: ParticipantAssetPayload;
}): ParticipantMasterStatus['state'] {
  if (args.asset?.state === 'failed') return 'failed';
  if (args.asset?.state === 'ready') return 'ready';
  if (args.asset?.state === 'processing') return 'processing';
  if (!args.hasTracks) return 'missing';
  if (args.masterTrack?.state === 'uploaded') return 'processing';
  if (args.masterTrack?.state === 'processed' && args.masterTrack.storage_key_final) return 'processing';
  return args.asset?.state === 'pending' ? 'pending' : 'pending';
}

function deriveParticipantMasterBlockedReason(args: {
  state: ParticipantMasterStatus['state'];
  hasTracks: boolean;
  masterTrack?: ParticipantTrackRow;
}): ParticipantMasterBlockedReason | undefined {
  if (args.state === 'failed') return 'participant_master_failed';
  if (!args.hasTracks || !args.masterTrack) return 'waiting_for_participant_media';
  if (args.state === 'processing' && args.masterTrack.state === 'processed') {
    return 'participant_master_pending_publish';
  }
  if (args.state === 'processing') return 'building_participant_master';
  if (args.state === 'pending') return 'waiting_for_participant_media';
  return undefined;
}

function buildParticipantMasterMetadata(args: {
  masterTrack: ParticipantTrackRow;
  trackCount: number;
  metadata?: Record<string, unknown>;
}) {
  return {
    selectionRule: 'video_then_screen_then_audio',
    sourceTrackId: args.masterTrack.id,
    sourceKind: args.masterTrack.kind,
    sourceTrackCount: args.trackCount,
    ...(args.metadata ?? {}),
  };
}

export async function markParticipantAssetPending(args: {
  recordingId: string;
  participantId: string;
}) {
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
      state: 'pending',
      export_set_json: [],
    },
    update: {
      state: 'pending',
      processing_started_at: null,
      failed_at: null,
      failure_reason: null,
    },
  });
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

export async function reconcileParticipantMasterAsset(args: {
  recordingId: string;
  participantId: string;
  processingTrackId?: string;
  failedTrackId?: string;
  failureReason?: string;
  readySource?: {
    trackId: string;
    storageKey: string;
    previewKey?: string;
    durationMs?: number;
    resolution?: string;
    metadata?: Record<string, unknown>;
    exportSet?: string[];
  };
}) {
  const participant = await prisma.participant.findFirst({
    where: {
      id: args.participantId,
      recording_id: args.recordingId,
    },
    select: {
      id: true,
      track: {
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          kind: true,
          state: true,
          storage_key_final: true,
          duration_ms: true,
          created_at: true,
        },
      },
    },
  });

  if (!participant) return { code: 'not_found' as const };

  const masterTrack = selectParticipantMasterTrack(participant.track);
  if (!masterTrack) {
    await markParticipantAssetPending({
      recordingId: args.recordingId,
      participantId: args.participantId,
    });
    return { code: 'ok' as const, state: 'pending' as const };
  }

  if (args.failedTrackId === masterTrack.id) {
    await markParticipantAssetFailed({
      recordingId: args.recordingId,
      participantId: args.participantId,
      reason: args.failureReason ?? 'participant_master_failed',
    });
    return { code: 'ok' as const, state: 'failed' as const, masterTrackId: masterTrack.id };
  }

  if (args.readySource?.trackId === masterTrack.id) {
    await markParticipantAssetReady({
      recordingId: args.recordingId,
      participantId: args.participantId,
      storageKey: args.readySource.storageKey,
      previewKey: args.readySource.previewKey ?? args.readySource.storageKey,
      durationMs: args.readySource.durationMs,
      resolution: args.readySource.resolution,
      metadata: buildParticipantMasterMetadata({
        masterTrack,
        trackCount: participant.track.length,
        metadata: args.readySource.metadata,
      }),
      exportSet:
        args.readySource.exportSet ??
        (masterTrack.kind === 'audio' ? ['wav'] : ['mp4']),
    });
    return { code: 'ok' as const, state: 'ready' as const, masterTrackId: masterTrack.id };
  }

  if (masterTrack.state === 'processed' && masterTrack.storage_key_final) {
    await markParticipantAssetReady({
      recordingId: args.recordingId,
      participantId: args.participantId,
      storageKey: masterTrack.storage_key_final,
      previewKey: masterTrack.storage_key_final,
      durationMs: masterTrack.duration_ms ?? undefined,
      metadata: buildParticipantMasterMetadata({
        masterTrack,
        trackCount: participant.track.length,
      }),
      exportSet: masterTrack.kind === 'audio' ? ['wav'] : ['mp4'],
    });
    return { code: 'ok' as const, state: 'ready' as const, masterTrackId: masterTrack.id };
  }

  if (args.processingTrackId === masterTrack.id || masterTrack.state === 'uploaded') {
    await markParticipantAssetProcessing({
      recordingId: args.recordingId,
      participantId: args.participantId,
    });
    return { code: 'ok' as const, state: 'processing' as const, masterTrackId: masterTrack.id };
  }

  await markParticipantAssetPending({
    recordingId: args.recordingId,
    participantId: args.participantId,
  });
  return { code: 'ok' as const, state: 'pending' as const, masterTrackId: masterTrack.id };
}

export async function listParticipantMasterStatesForRecording(
  recordingId: string
): Promise<ParticipantMasterStatus[]> {
  const rows = await prisma.participant.findMany({
    where: { recording_id: recordingId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      role: true,
      display_name: true,
      email: true,
      track: {
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          kind: true,
          state: true,
          storage_key_final: true,
          duration_ms: true,
          created_at: true,
        },
      },
      participant_asset: {
        orderBy: { updated_at: 'desc' },
        take: 1,
        select: {
          id: true,
          recording_id: true,
          participant_id: true,
          state: true,
          storage_key: true,
          preview_key: true,
          duration_ms: true,
          resolution: true,
          processing_started_at: true,
          ready_at: true,
          failed_at: true,
          failure_reason: true,
          export_set_json: true,
          metadata_json: true,
        },
      },
    },
  });

  return rows.map((row) => {
    const asset = row.participant_asset[0]
      ? toParticipantAssetPayload({
          ...row.participant_asset[0],
          participant: {
            role: row.role,
            display_name: row.display_name,
            email: row.email,
          },
        })
      : undefined;
    const masterTrack = selectParticipantMasterTrack(row.track);
    const state = deriveParticipantMasterState({
      hasTracks: row.track.length > 0,
      masterTrack,
      asset,
    });

    return {
      participantId: row.id,
      participantRole: row.role,
      participantName: row.display_name ?? undefined,
      participantEmail: row.email ?? undefined,
      isApplicable: row.track.length > 0,
      state,
      blockedReason: deriveParticipantMasterBlockedReason({
        state,
        hasTracks: row.track.length > 0,
        masterTrack,
      }),
      failureReason: asset?.failureReason,
      masterTrackId: masterTrack?.id,
      masterTrackKind: masterTrack?.kind,
      asset,
    } satisfies ParticipantMasterStatus;
  });
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

  return rows.map((row) =>
    toParticipantAssetPayload({
      ...row,
      export_set_json: row.export_set_json as Prisma.JsonValue | null,
      metadata_json: row.metadata_json as Prisma.JsonValue | null,
    })
  );
}
