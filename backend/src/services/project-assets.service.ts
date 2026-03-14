import type { Prisma, export_type, transcript_state } from '@prisma/client';
import type {
  GetProjectAssetsGraphResponse,
  ProjectAssetActionDto,
  ProjectAssetState,
} from '../dto/recordings/project-assets.dto.js';
import { prisma } from '../lib/prisma.js';

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' };

function toPublicUrl(storageKey?: string | null): string | undefined {
  if (!storageKey) return undefined;
  const base = (process.env.R2_PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) return undefined;
  return `${base}/${String(storageKey).replace(/^\/+/, '')}`;
}

function toBadge(state: ProjectAssetState): string {
  if (state === 'ready') return 'Ready';
  if (state === 'processing') return 'Processing';
  if (state === 'failed') return 'Failed';
  if (state === 'pending') return 'Pending';
  return 'Missing';
}

function actionForOpenUrl(label: string, url?: string): ProjectAssetActionDto[] {
  if (!url) return [];
  return [
    {
      id: `${label.toLowerCase().replace(/\s+/g, '_')}_open`,
      label,
      kind: 'open_url',
      href: url,
      method: 'GET',
    },
  ];
}

function pickCanonicalExport<T extends { type: export_type; updated_at: Date }>(
  rows: T[],
  type: export_type
): T | undefined {
  return rows
    .filter((row) => row.type === type)
    .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())[0];
}

function mapExportState(
  state?: 'queued' | 'running' | 'succeeded' | 'failed'
): ProjectAssetState {
  if (!state) return 'missing';
  if (state === 'succeeded') return 'ready';
  if (state === 'failed') return 'failed';
  return 'processing';
}

function mapTranscriptState(
  state?: transcript_state | null
): ProjectAssetState {
  if (!state) return 'missing';
  if (state === 'ready') return 'ready';
  if (state === 'failed') return 'failed';
  return 'processing';
}

function normalizeJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export async function getProjectAssetsGraphService(args: {
  recordingId: string;
  requesterId: string;
}): Promise<ServiceResult<GetProjectAssetsGraphResponse>> {
  const recording = await prisma.recording.findUnique({
    where: { id: args.recordingId },
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
          failure_reason: true,
        },
      },
      participant_asset: {
        orderBy: [{ participant_id: 'asc' }, { updated_at: 'desc' }],
        select: {
          id: true,
          participant_id: true,
          state: true,
          storage_key: true,
          preview_key: true,
          duration_ms: true,
          failure_reason: true,
          participant: {
            select: {
              role: true,
              display_name: true,
            },
          },
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
    },
  });

  if (!recording) return { code: 'not_found' };
  if (recording.userId && recording.userId !== args.requesterId) return { code: 'forbidden' };

  const combinedAssetRow = recording.combined_asset[0];
  const combinedState: ProjectAssetState = combinedAssetRow
    ? (combinedAssetRow.state === 'ready'
        ? 'ready'
        : combinedAssetRow.state === 'failed'
          ? 'failed'
          : combinedAssetRow.state === 'processing'
            ? 'processing'
            : 'pending')
    : 'pending';
  const combinedPreviewUrl = toPublicUrl(
    combinedAssetRow?.preview_key ?? combinedAssetRow?.storage_key
  );

  const participantAssets = recording.participant_asset.map((asset) => {
    const state: ProjectAssetState =
      asset.state === 'ready'
        ? 'ready'
        : asset.state === 'failed'
          ? 'failed'
          : asset.state === 'processing'
            ? 'processing'
            : 'pending';
    const previewUrl = toPublicUrl(asset.preview_key ?? asset.storage_key);
    const participantLabel =
      asset.participant.display_name?.trim() ||
      (asset.participant.role === 'host' ? 'Host' : 'Guest');
    return {
      id: asset.id,
      kind: 'participant' as const,
      label: participantLabel,
      state,
      badges: [toBadge(state), asset.participant.role === 'host' ? 'Host' : 'Guest'],
      durationMs: asset.duration_ms ?? undefined,
      previewUrl,
      blockedReason: state === 'failed' ? (asset.failure_reason ?? undefined) : undefined,
      actions: actionForOpenUrl('Download', previewUrl),
      participant: {
        id: asset.participant_id,
        role: asset.participant.role,
        name: asset.participant.display_name ?? undefined,
      },
    };
  });

  const transcriptRow = recording.transcript[0];
  const transcriptState = mapTranscriptState(transcriptRow?.state ?? null);
  const transcriptPreviewUrl = toPublicUrl(transcriptRow?.storage_key);
  const transcriptLabel = transcriptRow?.language
    ? `Transcript (${transcriptRow.language.toUpperCase()})`
    : 'Transcript';

  const exportWav = pickCanonicalExport(recording.export_artifact, 'wav');
  const exportMp4 = pickCanonicalExport(recording.export_artifact, 'mp4');
  const exportCaptions = pickCanonicalExport(recording.export_artifact, 'mp4_captions');

  const exportItems = [
    { type: 'mp4' as const, label: 'Video export (MP4)', row: exportMp4 },
    { type: 'wav' as const, label: 'Audio export (WAV)', row: exportWav },
    { type: 'mp4_captions' as const, label: 'Captioned video (All participants)', row: exportCaptions },
  ].map((entry) => {
    const state = mapExportState(entry.row?.state as any);
    const actions: ProjectAssetActionDto[] =
      entry.row?.id && state === 'ready'
        ? [
            {
              id: `${entry.type}_download`,
              label: 'Download',
              kind: 'api',
              href: `/v1/exports/${entry.row.id}`,
              method: 'GET',
            },
          ]
        : [];
    return {
      type: entry.type,
      label: entry.label,
      state,
      badges: [toBadge(state)],
      blockedReason: state === 'failed' ? (entry.row?.last_error ?? undefined) : undefined,
      actions,
    };
  });

  const ready = exportItems.filter((item) => item.state === 'ready').length;
  const failed = exportItems.filter((item) => item.state === 'failed').length;
  const processing = exportItems.filter((item) => item.state === 'processing').length;
  const missing = exportItems.filter((item) => item.state === 'missing').length;

  const captionsState = mapExportState(exportCaptions?.state as any);
  const captionsActions: ProjectAssetActionDto[] =
    exportCaptions?.id && captionsState === 'ready'
      ? [
          {
            id: 'captions_download',
            label: 'Download',
            kind: 'api',
            href: `/v1/exports/${exportCaptions.id}`,
            method: 'GET',
          },
        ]
      : [];

  const data: GetProjectAssetsGraphResponse = {
    project: {
      recordingId: recording.id,
      title: recording.title ?? undefined,
      status: recording.status,
      label: recording.title?.trim() || 'Untitled project',
    },
    combinedAsset: {
      id: combinedAssetRow?.id ?? `combined:${recording.id}`,
      kind: 'combined',
      label: 'All participants',
      state: combinedState,
      badges: [toBadge(combinedState)],
      durationMs: combinedAssetRow?.duration_ms ?? undefined,
      previewUrl: combinedPreviewUrl,
      blockedReason: combinedState === 'failed' ? (combinedAssetRow?.failure_reason ?? undefined) : undefined,
      actions: actionForOpenUrl('Play', combinedPreviewUrl),
    },
    participantAssets,
    transcript: {
      label: transcriptLabel,
      state: transcriptState,
      badges: [toBadge(transcriptState)],
      previewUrl: transcriptPreviewUrl,
      actions: actionForOpenUrl('Open transcript', transcriptPreviewUrl),
    },
    captions: {
      label: 'Captioned video (All participants)',
      state: captionsState,
      badges: [toBadge(captionsState)],
      previewUrl: undefined,
      actions: captionsActions,
    },
    exports: {
      requiredTotal: exportItems.length,
      ready,
      processing,
      failed,
      missing,
      items: exportItems,
    },
  };

  return { code: 'ok', data };
}
