import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  runCombinedComposition,
  type CombinedCompositionMode,
  type CombinedCompositionOutcome,
} from '../workers/combined.runner.js';
import { emitTelemetry } from '../lib/telemetry.js';
import { listParticipantMasterStatesForRecording } from './participant-asset.service.js';

export type CombinedAssetPayload = {
  id: string;
  recordingId: string;
  state: 'pending' | 'processing' | 'ready' | 'failed';
  storageKey?: string;
  previewKey?: string;
  durationMs?: number;
  resolution?: string;
  processingStartedAt?: string;
  readyAt?: string;
  failedAt?: string;
  failureReason?: string;
  exportSet: string[];
  metadata?: Record<string, unknown>;
};

type CompositionSource = {
  id: string;
  storageKey: string;
  updatedAtIso: string;
  audioStorageKey?: string;
  startOffsetSec?: number;
};

function normalizeJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function normalizeStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function toCombinedPayload(row: {
  id: string;
  recording_id: string;
  state: 'pending' | 'processing' | 'ready' | 'failed';
  storage_key: string | null;
  preview_key?: string | null;
  duration_ms: number | null;
  resolution: string | null;
  processing_started_at: Date | null;
  ready_at: Date | null;
  failed_at: Date | null;
  failure_reason: string | null;
  export_set_json?: Prisma.JsonValue | null;
  metadata_json?: Prisma.JsonValue | null;
}): CombinedAssetPayload {
  return {
    id: row.id,
    recordingId: row.recording_id,
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

function resolveCompositionMode(): CombinedCompositionMode {
  const raw = (process.env.COMBINED_COMPOSITION_MODE ?? '').trim().toLowerCase();
  if (raw === 'primary_only') return 'primary_only';
  if (raw === 'concat_all') return 'concat_all';
  return 'side_by_side'; // default: all participants visible simultaneously
}

function buildSourceFingerprint(mode: CombinedCompositionMode, sources: CompositionSource[]) {
  const sourceHash = sources
    .map((source) => `${source.id}:${source.updatedAtIso}:${source.audioStorageKey ?? ''}:${(source.startOffsetSec ?? 0).toFixed(3)}`)
    .join('|');
  return `${mode}:${sourceHash}`;
}

export async function getCombinedAssetForRecording(
  recordingId: string
): Promise<CombinedAssetPayload | undefined> {
  const row = await prisma.combined_asset.findUnique({
    where: { recording_id: recordingId },
  });
  if (!row) return undefined;
  return toCombinedPayload({
    ...row,
    state: row.state as 'pending' | 'processing' | 'ready' | 'failed',
    export_set_json: row.export_set_json as Prisma.JsonValue | null,
    metadata_json: row.metadata_json as Prisma.JsonValue | null,
  });
}

export async function reconcileCombinedAssetForRecording(args: {
  recordingId: string;
  composeRunner?: (args: {
    recordingId: string;
    mode: CombinedCompositionMode;
    sources: Array<{ id: string; storageKey: string; audioStorageKey?: string; startOffsetSec?: number }>;
  }) => Promise<CombinedCompositionOutcome>;
}): Promise<
  | { code: 'ok'; composed: boolean; asset: CombinedAssetPayload }
  | { code: 'skipped'; reason: 'no_participant_media' | 'participant_assets_not_ready' }
  | { code: 'failed'; message: string }
> {
  const participantMasters = await listParticipantMasterStatesForRecording(args.recordingId);
  const applicableParticipants = participantMasters.filter((participant) => participant.isApplicable);

  if (applicableParticipants.length === 0) {
    return { code: 'skipped', reason: 'no_participant_media' };
  }

  const failedParticipant = applicableParticipants.find((participant) => participant.state === 'failed');
  if (failedParticipant) {
    const message = failedParticipant.failureReason ?? 'participant_master_failed';
    const failed = await prisma.combined_asset.upsert({
      where: { recording_id: args.recordingId },
      create: {
        recording_id: args.recordingId,
        state: 'failed',
        failed_at: new Date(),
        failure_reason: message.slice(0, 1000),
        metadata_json: {
          blockedByParticipantId: failedParticipant.participantId,
          blockedByReason: failedParticipant.failureReason ?? 'participant_master_failed',
        } as Prisma.InputJsonValue,
        export_set_json: [],
      },
      update: {
        state: 'failed',
        failed_at: new Date(),
        failure_reason: message.slice(0, 1000),
        metadata_json: {
          blockedByParticipantId: failedParticipant.participantId,
          blockedByReason: failedParticipant.failureReason ?? 'participant_master_failed',
        } as Prisma.InputJsonValue,
      },
    });

    emitTelemetry({
      level: 'error',
      event: 'asset.combined.blocked',
      message: 'Combined asset blocked by failed participant master',
      recordingId: args.recordingId,
      assetId: failed.id,
      participantId: failedParticipant.participantId,
      reason: message.slice(0, 1000),
    });
    return { code: 'failed', message };
  }

  const readyParticipants = applicableParticipants.filter(
    (participant) =>
      participant.state === 'ready' &&
      participant.asset?.id &&
      participant.asset.storageKey
  );
  if (readyParticipants.length !== applicableParticipants.length) {
    await prisma.combined_asset.upsert({
      where: { recording_id: args.recordingId },
      create: {
        recording_id: args.recordingId,
        state: 'pending',
        metadata_json: {
          expectedParticipantCount: applicableParticipants.length,
          readyParticipantCount: readyParticipants.length,
        } as Prisma.InputJsonValue,
        export_set_json: [],
      },
      update: {
        state: 'pending',
        failed_at: null,
        failure_reason: null,
        metadata_json: {
          expectedParticipantCount: applicableParticipants.length,
          readyParticipantCount: readyParticipants.length,
        } as Prisma.InputJsonValue,
      },
    });
    return { code: 'skipped', reason: 'participant_assets_not_ready' };
  }

  const mode = resolveCompositionMode();

  const participantIds = readyParticipants.map((p) => p.participantId);

  // Fetch session start time and per-participant master track recording_started_at
  // so we can compute join offsets for timeline alignment in the combined output.
  const [recording, masterTracks, audioTracks] = await Promise.all([
    prisma.recording.findUnique({
      where: { id: args.recordingId },
      select: { started_at: true },
    }),
    participantIds.length > 0
      ? prisma.track.findMany({
          where: {
            recording_id: args.recordingId,
            participant_id: { in: participantIds },
            kind: { in: ['video', 'screen'] },
            state: 'processed',
            storage_key_final: { not: null },
          },
          select: { participant_id: true, kind: true, recording_started_at: true, created_at: true },
          orderBy: { created_at: 'asc' },
        })
      : Promise.resolve([]),
    // Gather processed audio tracks per participant to mix into video sources.
    participantIds.length > 0
      ? prisma.track.findMany({
          where: {
            recording_id: args.recordingId,
            participant_id: { in: participantIds },
            kind: 'audio',
            state: 'processed',
            storage_key_final: { not: null },
          },
          select: { participant_id: true, storage_key_final: true },
          orderBy: { created_at: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  // Build per-participant start offset: seconds after session start when their
  // recorder actually began. Guests who join late will have a positive offset.
  const sessionStartMs = recording?.started_at?.getTime() ?? null;
  const KIND_PRIORITY: Record<string, number> = { screen: 0, video: 1, audio: 2 };
  // For each participant pick master track (screen > video priority, earliest created_at).
  const masterByParticipant = new Map<string, Date | null>();
  for (const t of masterTracks) {
    const existing = masterByParticipant.get(t.participant_id);
    if (existing === undefined) {
      masterByParticipant.set(t.participant_id, t.recording_started_at);
    } else {
      // Already have one — keep only if this track has higher priority.
      // (masterTracks is ordered by created_at asc so within same kind first wins.)
    }
  }
  // Re-run with proper priority sort (screen beats video regardless of created_at).
  masterByParticipant.clear();
  const sortedMasterTracks = [...masterTracks].sort((a, b) => {
    const pd = (KIND_PRIORITY[a.kind] ?? 99) - (KIND_PRIORITY[b.kind] ?? 99);
    if (pd !== 0) return pd;
    return a.created_at.getTime() - b.created_at.getTime();
  });
  for (const t of sortedMasterTracks) {
    if (!masterByParticipant.has(t.participant_id)) {
      masterByParticipant.set(t.participant_id, t.recording_started_at);
    }
  }

  const startOffsetSecByParticipant = new Map<string, number>();
  for (const [participantId, recordingStartedAt] of masterByParticipant) {
    if (sessionStartMs != null && recordingStartedAt != null) {
      const offsetMs = recordingStartedAt.getTime() - sessionStartMs;
      startOffsetSecByParticipant.set(participantId, Math.max(0, offsetMs / 1000));
    } else {
      startOffsetSecByParticipant.set(participantId, 0);
    }
  }

  const audioByParticipant = new Map(
    audioTracks.map((t) => [t.participant_id, t.storage_key_final!])
  );

  const selectedSources: CompositionSource[] =
    mode === 'primary_only'
      ? [
          {
            id: readyParticipants[0]!.asset!.id,
            storageKey: readyParticipants[0]!.asset!.storageKey as string,
            audioStorageKey: audioByParticipant.get(readyParticipants[0]!.participantId),
            startOffsetSec: startOffsetSecByParticipant.get(readyParticipants[0]!.participantId) ?? 0,
            updatedAtIso: readyParticipants[0]!.asset!.readyAt ?? readyParticipants[0]!.asset!.processingStartedAt ?? new Date(0).toISOString(),
          },
        ]
      : readyParticipants.map((participant) => ({
          id: participant.asset!.id,
          storageKey: participant.asset!.storageKey as string,
          audioStorageKey: audioByParticipant.get(participant.participantId),
          startOffsetSec: startOffsetSecByParticipant.get(participant.participantId) ?? 0,
          updatedAtIso:
            participant.asset!.readyAt ??
            participant.asset!.processingStartedAt ??
            new Date(0).toISOString(),
        }));

  const sourceFingerprint = buildSourceFingerprint(mode, selectedSources);
  const existing = await prisma.combined_asset.findUnique({
    where: { recording_id: args.recordingId },
  });
  const existingMetadata = normalizeJsonObject(existing?.metadata_json as Prisma.JsonValue | null);

  if (
    existing?.state === 'ready' &&
    existing.storage_key &&
    existingMetadata?.sourceFingerprint === sourceFingerprint
  ) {
    return {
      code: 'ok',
      composed: false,
      asset: toCombinedPayload({
        ...existing,
        state: existing.state as 'pending' | 'processing' | 'ready' | 'failed',
        export_set_json: existing.export_set_json as Prisma.JsonValue | null,
        metadata_json: existing.metadata_json as Prisma.JsonValue | null,
      }),
    };
  }

  const now = new Date();
  const processingMetadata = {
    mode,
    sourceFingerprint,
    sourceAssetIds: selectedSources.map((source) => source.id),
    sourceAssetCount: selectedSources.length,
  };

  // Atomically claim the combined asset for processing — only one worker wins.
  // If existing row is already processing, the loser returns skipped.
  // Include 'ready' here: we only reach this code when fingerprint doesn't match
  // (the early-return above handles fingerprint-match). A 'ready' row with a
  // stale fingerprint (e.g. mode changed from concat_all → side_by_side) must
  // be recomposed — otherwise the old output is served forever.
  let processing: { id: string };
  if (existing) {
    const claimed = await prisma.combined_asset.updateMany({
      where: {
        recording_id: args.recordingId,
        state: { in: ['pending', 'failed', 'ready'] },
      },
      data: {
        state: 'processing',
        processing_started_at: now,
        failed_at: null,
        failure_reason: null,
        metadata_json: processingMetadata as Prisma.InputJsonValue,
      },
    });
    if (claimed.count === 0) {
      return { code: 'skipped', reason: 'participant_assets_not_ready' };
    }
    processing = existing;
  } else {
    processing = await prisma.combined_asset.create({
      data: {
        recording_id: args.recordingId,
        state: 'processing',
        processing_started_at: now,
        metadata_json: processingMetadata as Prisma.InputJsonValue,
        export_set_json: [],
      },
    });
  }
  emitTelemetry({
    event: 'asset.combined.processing',
    message: 'Combined asset composition started',
      recordingId: args.recordingId,
      assetId: processing.id,
      sourceAssetCount: selectedSources.length,
      compositionMode: mode,
      expectedParticipantCount: applicableParticipants.length,
    });

  try {
    const compose = args.composeRunner ?? runCombinedComposition;
    const composed = await compose({
      recordingId: args.recordingId,
      mode,
      sources: selectedSources.map((source) => ({
        id: source.id,
        storageKey: source.storageKey,
        audioStorageKey: source.audioStorageKey,
        startOffsetSec: source.startOffsetSec,
      })),
    });

    const readyMetadata = {
      ...processingMetadata,
      composedAt: new Date().toISOString(),
      outputStorageKey: composed.storageKey,
      outputPreviewKey: composed.previewKey,
    };

    const updated = await prisma.combined_asset.update({
      where: { recording_id: args.recordingId },
      data: {
        state: 'ready',
        storage_key: composed.storageKey,
        preview_key: composed.previewKey,
        duration_ms: composed.durationMs ?? null,
        resolution: composed.resolution ?? null,
        ready_at: now,
        failed_at: null,
        failure_reason: null,
        export_set_json: composed.exportSet,
        metadata_json: readyMetadata as Prisma.InputJsonValue,
      },
    });

    emitTelemetry({
      event: 'asset.combined.ready',
      message: 'Combined asset marked ready',
      recordingId: args.recordingId,
      assetId: updated.id,
      storageKey: updated.storage_key ?? undefined,
      previewKey: updated.preview_key ?? undefined,
      durationMs: updated.duration_ms ?? undefined,
      resolution: updated.resolution ?? undefined,
      sourceAssetCount: selectedSources.length,
      compositionMode: mode,
    });
    return {
      code: 'ok',
      composed: true,
      asset: toCombinedPayload({
        ...updated,
        state: updated.state as 'pending' | 'processing' | 'ready' | 'failed',
        export_set_json: updated.export_set_json as Prisma.JsonValue | null,
        metadata_json: updated.metadata_json as Prisma.JsonValue | null,
      }),
    };
  } catch (error) {
    const message = (error as Error)?.message ?? 'combined_composition_failed';
    const failed = await prisma.combined_asset.update({
      where: { recording_id: args.recordingId },
      data: {
        state: 'failed',
        failed_at: new Date(),
        failure_reason: message.slice(0, 1000),
      },
    });
    emitTelemetry({
      level: 'error',
      event: 'asset.combined.failed',
      message: 'Combined asset composition failed',
      recordingId: args.recordingId,
      assetId: failed.id,
      reason: message.slice(0, 1000),
      err: error,
      sourceAssetCount: selectedSources.length,
      compositionMode: mode,
    });
    return {
      code: 'failed',
      message,
    };
  }
}
