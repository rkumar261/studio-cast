import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { AsrSegment } from './asr.service.js';
import { emitTelemetry } from '../lib/telemetry.js';

export type TranscriptSourceType = 'combined_asset' | 'participant_asset' | 'track';

export type TranscriptSource = {
  type: TranscriptSourceType;
  assetId: string;
  storageKey: string;
  trackId: string | null;
};

export async function resolveTranscriptSourceForTrack(args: {
  recordingId: string;
  trackId: string;
  participantId: string;
  fallbackTrackStorageKey?: string | null;
}): Promise<TranscriptSource> {
  const combinedAsset = await prisma.combined_asset.findUnique({
    where: { recording_id: args.recordingId },
    select: {
      id: true,
      state: true,
      storage_key: true,
    },
  });

  if (combinedAsset?.state === 'ready' && combinedAsset.storage_key) {
    return {
      type: 'combined_asset',
      assetId: combinedAsset.id,
      storageKey: combinedAsset.storage_key,
      trackId: null,
    };
  }

  const participantAsset = await prisma.participant_asset.findUnique({
    where: {
      recording_id_participant_id: {
        recording_id: args.recordingId,
        participant_id: args.participantId,
      },
    },
    select: {
      id: true,
      state: true,
      storage_key: true,
    },
  });

  if (participantAsset?.state === 'ready' && participantAsset.storage_key) {
    return {
      type: 'participant_asset',
      assetId: participantAsset.id,
      storageKey: participantAsset.storage_key,
      trackId: args.trackId,
    };
  }

  if (args.fallbackTrackStorageKey) {
    return {
      type: 'track',
      assetId: args.trackId,
      storageKey: args.fallbackTrackStorageKey,
      trackId: args.trackId,
    };
  }

  throw new Error('transcript_source_not_ready');
}

export async function beginTranscriptRevision(args: {
  recordingId: string;
  trackId: string | null;
  sourceType: TranscriptSourceType;
  sourceAssetId: string;
  sourceStorageKey: string;
  language?: string;
}) {
  const now = new Date();
  const nextLanguage = (args.language ?? 'en').trim().toLowerCase() || 'en';
  const metadata: Prisma.InputJsonValue = {
    sourceType: args.sourceType,
    sourceAssetId: args.sourceAssetId,
    sourceStorageKey: args.sourceStorageKey,
    revisionStartedAt: now.toISOString(),
  };

  const latest = await prisma.transcript.findFirst({
    where: { recording_id: args.recordingId },
    orderBy: [{ revision: 'desc' }, { updated_at: 'desc' }],
    select: {
      id: true,
      revision: true,
    },
  });

  if (!latest) {
    return prisma.transcript.create({
      data: {
        recording_id: args.recordingId,
        track_id: args.trackId,
        revision: 1,
        state: 'processing',
        language: nextLanguage,
        source_type: args.sourceType,
        source_asset_id: args.sourceAssetId,
        metadata_json: metadata,
        segment_count: 0,
        processing_started_at: now,
        published_at: null,
        ready_at: null,
        failed_at: null,
        failure_reason: null,
        storage_key: null,
      },
      select: {
        id: true,
        revision: true,
      },
    });
  }

  return prisma.transcript.update({
    where: { id: latest.id },
    data: {
      revision: latest.revision + 1,
      track_id: args.trackId,
      state: 'processing',
      language: nextLanguage,
      source_type: args.sourceType,
      source_asset_id: args.sourceAssetId,
      metadata_json: metadata,
      segment_count: 0,
      processing_started_at: now,
      published_at: null,
      ready_at: null,
      failed_at: null,
      failure_reason: null,
      storage_key: null,
    },
    select: {
      id: true,
      revision: true,
    },
  });
}

function normalizeSegments(segments: AsrSegment[]): AsrSegment[] {
  const safe = segments
    .map((segment) => ({
      ...segment,
      startMs: Math.max(0, Math.floor(segment.startMs)),
      endMs: Math.max(0, Math.floor(segment.endMs)),
      text: segment.text.trim(),
    }))
    .filter((segment) => segment.text.length > 0)
    .sort((a, b) => a.startMs - b.startMs);

  return safe.map((segment) => ({
    ...segment,
    endMs: Math.max(segment.endMs, segment.startMs + 100),
  }));
}

export async function publishTranscriptRevision(args: {
  transcriptId: string;
  recordingId: string;
  trackId: string | null;
  segments: AsrSegment[];
  language?: string;
  storageKey?: string | null;
}) {
  const now = new Date();
  const nextLanguage = (args.language ?? 'en').trim().toLowerCase() || 'en';
  const normalizedSegments = normalizeSegments(args.segments);

  await prisma.$transaction(async (tx) => {
    await tx.transcript_segment.deleteMany({
      where: { transcript_id: args.transcriptId },
    });

    if (normalizedSegments.length > 0) {
      await tx.transcript_segment.createMany({
        data: normalizedSegments.map((segment) => ({
          transcript_id: args.transcriptId,
          recording_id: args.recordingId,
          track_id: args.trackId,
          start_ms: segment.startMs,
          end_ms: segment.endMs,
          text: segment.text,
          speaker: segment.speaker ?? null,
          confidence: segment.confidence ?? null,
        })),
      });
    }

    await tx.transcript.update({
      where: { id: args.transcriptId },
      data: {
        state: 'ready',
        language: nextLanguage,
        storage_key: args.storageKey ?? null,
        segment_count: normalizedSegments.length,
        ready_at: now,
        published_at: now,
        failed_at: null,
        failure_reason: null,
      },
    });
  });

  emitTelemetry({
    event: 'transcript.ready',
    message: 'Transcript revision published as ready',
    recordingId: args.recordingId,
    trackId: args.trackId ?? undefined,
    assetId: args.transcriptId,
    segmentCount: normalizedSegments.length,
    language: nextLanguage,
  });
}

export async function markTranscriptRevisionFailed(args: {
  transcriptId: string;
  reason: string;
}) {
  const row = await prisma.transcript.update({
    where: { id: args.transcriptId },
    data: {
      state: 'failed',
      failed_at: new Date(),
      failure_reason: args.reason.slice(0, 1000),
    },
    select: {
      id: true,
      recording_id: true,
      track_id: true,
    },
  });
  emitTelemetry({
    level: 'error',
    event: 'transcript.failed',
    message: 'Transcript revision marked failed',
    recordingId: row.recording_id,
    trackId: row.track_id ?? undefined,
    assetId: row.id,
    reason: args.reason.slice(0, 1000),
  });
}
