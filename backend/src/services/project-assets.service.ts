import type { Prisma, export_type, transcript_state } from '@prisma/client';
import type {
  ProjectAssetState,
  GetProjectAssetsGraphResponse,
  ProjectAssetActionDto,
} from '../dto/recordings/project-assets.dto.js';
import { prisma } from '../lib/prisma.js';
import { toPublicAssetUrl } from '../lib/public-assets.js';
import { listParticipantMasterStatesForRecording } from './participant-asset.service.js';

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' };

function toBadge(state: ProjectAssetState): string {
  if (state === 'upload complete') return 'Upload complete';
  if (state === 'action required') return 'Action required';
  if (state === 'processing') return 'Processing';
  if (state === 'uploading') return 'Uploading';
  if (state === 'ready') return 'Ready';
  return 'Recording';
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
  if (!state) return 'processing';
  if (state === 'succeeded') return 'ready';
  if (state === 'failed') return 'action required';
  return 'processing';
}

function mapTranscriptState(
  state?: transcript_state | null
): ProjectAssetState {
  if (!state) return 'processing';
  if (state === 'ready') return 'ready';
  if (state === 'failed') return 'action required';
  return 'processing';
}

function normalizeJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function mapAssetState(
  state?: 'missing' | 'pending' | 'processing' | 'ready' | 'failed' | null
): ProjectAssetState {
  if (!state) return 'processing';
  if (state === 'ready') return 'ready';
  if (state === 'failed') return 'action required';
  return 'processing';
}

function blockedReasonForExport(args: {
  state: ProjectAssetState;
  lastError?: string | null;
}) {
  if (args.state === 'action required') return args.lastError ?? 'Export needs attention.';
  if (args.state === 'processing') return 'Processing is still running for this export.';
  if (args.state === 'uploading') return 'Uploads must finish before this export can start.';
  return undefined;
}

function mapRecordingState(status: string): ProjectAssetState {
  if (status === 'ready') return 'ready';
  if (status === 'processing') return 'processing';
  if (status === 'error') return 'action required';
  if (status === 'uploading') return 'uploading';
  return 'recording';
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
    },
  });

  if (!recording) return { code: 'not_found' };
  if (recording.userId && recording.userId !== args.requesterId) return { code: 'forbidden' };

  const participantMasterStates = await listParticipantMasterStatesForRecording(args.recordingId);
  const combinedAssetRow = recording.combined_asset[0];
  const applicableParticipants = participantMasterStates.filter((participant) => participant.isApplicable);
  const anyParticipantMasterFailed = applicableParticipants.some((participant) => participant.state === 'failed');
  const anyParticipantMasterPending = applicableParticipants.some(
    (participant) => participant.state === 'pending' || participant.state === 'processing'
  );
  const anyExportFailed = recording.export_artifact.some((artifact) => artifact.state === 'failed');
  const projectState = anyParticipantMasterFailed
    || anyExportFailed
    || combinedAssetRow?.state === 'failed'
    || recording.status === 'error'
    ? 'action required'
    : recording.status === 'ready'
      ? 'ready'
      : recording.status === 'uploading'
        ? 'uploading'
        : 'processing';
  const combinedState: ProjectAssetState = combinedAssetRow
    ? mapAssetState(combinedAssetRow.state)
    : anyParticipantMasterFailed
      ? 'action required'
      : anyParticipantMasterPending
        ? projectState === 'uploading'
          ? 'uploading'
          : 'processing'
        : 'processing';
  const combinedPreviewUrl = toPublicAssetUrl(
    combinedAssetRow?.preview_key ?? combinedAssetRow?.storage_key
  );

  const participantAssets = applicableParticipants.map((participant) => {
    const state = mapAssetState(participant.asset?.state ?? participant.state);
    const previewUrl = toPublicAssetUrl(participant.asset?.previewKey ?? participant.asset?.storageKey);
    const participantLabel =
      participant.participantName?.trim() ||
      (participant.participantRole === 'host' ? 'Host' : 'Guest');
    return {
      id: participant.asset?.id ?? `participant:${participant.participantId}`,
      kind: 'participant' as const,
      label: participantLabel,
      state,
      badges: [toBadge(state), participant.participantRole === 'host' ? 'Host' : 'Guest'],
      durationMs: participant.asset?.durationMs,
      previewUrl,
      blockedReason: state === 'action required'
        ? participant.failureReason ?? 'This participant asset needs attention.'
        : state === 'processing'
          ? 'This participant asset is still processing.'
          : state === 'uploading'
            ? 'Uploads must finish before this participant asset is ready.'
            : participant.blockedReason,
      actions: actionForOpenUrl('Download', previewUrl),
      participant: {
        id: participant.participantId,
        role: participant.participantRole,
        name: participant.participantName,
      },
    };
  });

  const transcriptRow = recording.transcript[0];
  const transcriptState = mapTranscriptState(transcriptRow?.state ?? null);
  const transcriptPreviewUrl = toPublicAssetUrl(transcriptRow?.storage_key);
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
      blockedReason: blockedReasonForExport({
        state,
        lastError: entry.row?.last_error,
      }),
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
      state: projectState,
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
      blockedReason:
        combinedState === 'action required'
          ? (combinedAssetRow?.failure_reason ??
            applicableParticipants.find((participant) => participant.state === 'failed')?.failureReason ??
            'The combined recording needs attention.')
          : combinedState === 'processing'
            ? 'The combined recording is still processing.'
            : combinedState === 'uploading'
              ? anyParticipantMasterPending
                ? 'Participant uploads must finish before the combined recording is ready.'
                : 'Uploads are still being finalized before the combined recording can start.'
              : undefined,
      actions: actionForOpenUrl('Play', combinedPreviewUrl),
    },
    participantAssets,
    transcript: {
      label: transcriptLabel,
      state: transcriptState,
      badges: [toBadge(transcriptState)],
      previewUrl: transcriptPreviewUrl,
      blockedReason:
        transcriptState === 'action required'
          ? (transcriptRow?.failure_reason ??
            (normalizeJsonObject(transcriptRow?.metadata_json)?.failureReason as string | undefined) ??
            'Transcript needs attention.')
          : transcriptState === 'processing'
            ? 'Transcript is still processing.'
            : transcriptState === 'uploading'
              ? 'Uploads must finish before the transcript can start.'
              : undefined,
      actions: actionForOpenUrl('Open transcript', transcriptPreviewUrl),
    },
    captions: {
      label: 'Captioned video (All participants)',
      state: captionsState,
      badges: [toBadge(captionsState)],
      previewUrl: undefined,
      blockedReason: blockedReasonForExport({
        state: captionsState,
        lastError: exportCaptions?.last_error,
      }),
      actions: captionsActions,
    },
    exports: {
      requiredTotal: exportItems.length,
      ready,
      processing,
      actionRequired: failed + missing,
      items: exportItems,
    },
  };

  return { code: 'ok', data };
}
