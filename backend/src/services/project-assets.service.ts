import type { Prisma, export_type, transcript_state } from '@prisma/client';
import type {
  ProjectAssetState,
  GetProjectAssetsGraphResponse,
  ProjectAssetActionDto,
  ProjectAssetWorkItemDto,
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

function actionForReadyAsset(args: {
  playbackUrl?: string;
  downloadUrl?: string;
}): ProjectAssetActionDto[] {
  const actions: ProjectAssetActionDto[] = [];
  if (args.playbackUrl) {
    actions.push({
      id: 'play_open',
      label: 'Play',
      kind: 'open_url',
      href: args.playbackUrl,
      method: 'GET',
    });
  }
  if (args.downloadUrl && args.downloadUrl !== args.playbackUrl) {
    actions.push({
      id: 'download_open',
      label: 'Download',
      kind: 'open_url',
      href: args.downloadUrl,
      method: 'GET',
    });
  } else if (args.downloadUrl) {
    actions.push({
      id: 'download_open',
      label: 'Download',
      kind: 'open_url',
      href: args.downloadUrl,
      method: 'GET',
    });
  }
  return actions;
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

function parseResolution(resolution?: string | null) {
  const raw = resolution?.trim();
  if (!raw) return { width: undefined, height: undefined };
  const match = /^(\d+)x(\d+)$/i.exec(raw);
  if (!match) return { width: undefined, height: undefined };
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function isTerminalState(state: ProjectAssetState) {
  return state === 'ready' || state === 'action required';
}

function isPendingState(state: ProjectAssetState) {
  return state === 'processing' || state === 'uploading';
}

function toWorkItem(args: {
  label: string;
  state: ProjectAssetState;
  reason?: string;
  participantId?: string;
}): ProjectAssetWorkItemDto | undefined {
  if (args.state !== 'uploading' && args.state !== 'processing' && args.state !== 'action required') {
    return undefined;
  }
  return {
    label: args.label,
    state: args.state,
    reason: args.reason,
    participantId: args.participantId,
  };
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

  if (!recording) return { code: 'not_found' };
  if (recording.userId && recording.userId !== args.requesterId) return { code: 'forbidden' };

  const participantMasterStates = await listParticipantMasterStatesForRecording(args.recordingId);

  // Map participantId → raw video preview URL (available after stitch, before transcode).
  const rawPreviewByParticipant = new Map<string, string>();
  for (const p of recording.participant) {
    const rawKey = p.track[0]?.storage_key_raw;
    const rawUrl = toPublicAssetUrl(rawKey);
    if (rawUrl) rawPreviewByParticipant.set(p.id, rawUrl);
  }

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
  const combinedDownloadUrl = toPublicAssetUrl(combinedAssetRow?.storage_key);
  const combinedResolution = parseResolution(combinedAssetRow?.resolution);
  // Raw preview: show the first available participant raw track while combined is processing.
  const combinedRawPreviewUrl = combinedState !== 'ready'
    ? [...rawPreviewByParticipant.values()][0]
    : undefined;

  const participantAssets = applicableParticipants.map((participant) => {
    const state = mapAssetState(participant.asset?.state ?? participant.state);
    const previewUrl = toPublicAssetUrl(participant.asset?.previewKey ?? participant.asset?.storageKey);
    const downloadUrl = toPublicAssetUrl(participant.asset?.storageKey ?? participant.asset?.previewKey);
    const resolution = parseResolution(participant.asset?.resolution);
    const participantLabel =
      participant.participantName?.trim() ||
      (participant.participantRole === 'host' ? 'Host' : 'Guest');
    const blockedReason = state === 'action required'
      ? participant.failureReason ?? 'This participant asset needs attention.'
      : state === 'processing'
        ? 'This participant asset is still processing.'
        : state === 'uploading'
          ? 'Uploads must finish before this participant asset is ready.'
          : participant.blockedReason;
    const pendingWork = isPendingState(state)
      ? [toWorkItem({ label: participantLabel, state, reason: blockedReason, participantId: participant.participantId })!]
      : [];
    const failedWork = state === 'action required'
      ? [toWorkItem({ label: participantLabel, state, reason: blockedReason, participantId: participant.participantId })!]
      : [];
    const rawParticipantPreviewUrl = rawPreviewByParticipant.get(participant.participantId) || undefined;
    return {
      id: participant.asset?.id ?? `participant:${participant.participantId}`,
      kind: 'participant' as const,
      type: 'participant_playback' as const,
      label: participantLabel,
      state,
      badges: [toBadge(state), participant.participantRole === 'host' ? 'Host' : 'Guest'],
      durationMs: participant.asset?.durationMs,
      width: resolution.width,
      height: resolution.height,
      previewUrl,
      playbackUrl: previewUrl,
      rawPreviewUrl: state !== 'ready' ? rawParticipantPreviewUrl : undefined,
      downloadUrl,
      blockedReason,
      availableDerivatives: participant.asset?.exportSet ?? [],
      minimumReady: state === 'ready',
      fullyProcessed: isTerminalState(state),
      pendingWork,
      failedWork,
      participantId: participant.participantId,
      displayName: participant.participantName,
      role: participant.participantRole,
      actions: state === 'ready' ? actionForReadyAsset({ playbackUrl: previewUrl, downloadUrl }) : [],
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
  const transcriptBlockedReason =
    transcriptState === 'action required'
      ? (transcriptRow?.failure_reason ??
        (normalizeJsonObject(transcriptRow?.metadata_json)?.failureReason as string | undefined) ??
        'Transcript needs attention.')
      : transcriptState === 'processing'
        ? 'Transcript is still processing.'
        : transcriptState === 'uploading'
          ? 'Uploads must finish before the transcript can start.'
          : undefined;
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
      id: entry.row?.id,
      type: entry.type,
      label: entry.label,
      state,
      badges: [toBadge(state)],
      downloadUrl: state === 'ready' ? `/v1/exports/${entry.row?.id}` : undefined,
      blockedReason: blockedReasonForExport({
        state,
        lastError: entry.row?.last_error,
      }),
      minimumReady: state === 'ready',
      fullyProcessed: isTerminalState(state),
      pendingWork: isPendingState(state)
        ? [toWorkItem({ label: entry.label, state, reason: blockedReasonForExport({ state, lastError: entry.row?.last_error })! })!]
        : [],
      failedWork: state === 'action required'
        ? [toWorkItem({ label: entry.label, state, reason: blockedReasonForExport({ state, lastError: entry.row?.last_error })! })!]
        : [],
      actions,
    };
  });

  const ready = exportItems.filter((item) => item.state === 'ready').length;
  const processing = exportItems.filter((item) => item.state === 'processing').length;
  const actionRequired = exportItems.filter((item) => item.state === 'action required').length;

  const captionsState = mapExportState(exportCaptions?.state as any);
  const captionsBlockedReason = blockedReasonForExport({
    state: captionsState,
    lastError: exportCaptions?.last_error,
  });
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
      minimumReady: false,
      fullyProcessed: false,
    },
    combinedAsset: {
      id: combinedAssetRow?.id ?? `combined:${recording.id}`,
      kind: 'combined',
      type: 'combined_playback',
      label: 'All participants',
      state: combinedState,
      badges: [toBadge(combinedState)],
      durationMs: combinedAssetRow?.duration_ms ?? undefined,
      width: combinedResolution.width,
      height: combinedResolution.height,
      previewUrl: combinedPreviewUrl,
      playbackUrl: combinedPreviewUrl,
      rawPreviewUrl: combinedRawPreviewUrl,
      downloadUrl: combinedDownloadUrl,
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
      availableDerivatives: Array.isArray(combinedAssetRow?.export_set_json)
        ? (combinedAssetRow?.export_set_json as string[])
        : [],
      minimumReady: combinedState === 'ready',
      fullyProcessed: isTerminalState(combinedState),
      pendingWork: isPendingState(combinedState)
        ? [toWorkItem({
            label: 'Combined',
            state: combinedState,
            reason:
              combinedState === 'processing'
                ? 'The combined recording is still processing.'
                : 'Participant uploads must finish before the combined recording is ready.',
          })!]
        : [],
      failedWork: combinedState === 'action required'
        ? [toWorkItem({
            label: 'Combined',
            state: combinedState,
            reason:
              combinedAssetRow?.failure_reason ??
              applicableParticipants.find((participant) => participant.state === 'failed')?.failureReason ??
              'The combined recording needs attention.',
          })!]
        : [],
      actions: combinedState === 'ready'
        ? [
            {
              id: 'combined_play',
              label: 'Play',
              kind: 'open_url',
              href: combinedPreviewUrl as string,
              method: 'GET',
            },
            ...(combinedDownloadUrl
              ? [{
                  id: 'combined_download',
                  label: 'Download',
                  kind: 'open_url' as const,
                  href: combinedDownloadUrl,
                  method: 'GET' as const,
                }]
              : []),
          ]
        : [],
    },
    participantAssets,
    processingSummary: {
      minimumReady: false,
      fullyProcessed: false,
      readyPrimaryAsset: combinedState === 'ready',
      readyParticipantCount: participantAssets.filter((asset) => asset.state === 'ready').length,
      participantCount: participantAssets.length,
      pendingWork: [],
      failedWork: [],
    },
    transcript: {
      id: transcriptRow?.id,
      type: 'transcript_artifact',
      label: transcriptLabel,
      state: transcriptState,
      badges: [toBadge(transcriptState)],
      previewUrl: transcriptPreviewUrl,
      downloadUrl: transcriptPreviewUrl,
      blockedReason: transcriptBlockedReason,
      minimumReady: transcriptState === 'ready',
      fullyProcessed: isTerminalState(transcriptState),
      pendingWork: isPendingState(transcriptState)
        ? [toWorkItem({ label: transcriptLabel, state: transcriptState, reason: transcriptBlockedReason })!]
        : [],
      failedWork: transcriptState === 'action required'
        ? [toWorkItem({ label: transcriptLabel, state: transcriptState, reason: transcriptBlockedReason })!]
        : [],
      actions: actionForOpenUrl('Open transcript', transcriptPreviewUrl),
    },
    captions: {
      id: exportCaptions?.id,
      type: 'caption_derivative',
      label: 'Captioned video (All participants)',
      state: captionsState,
      badges: [toBadge(captionsState)],
      previewUrl: undefined,
      downloadUrl: captionsState === 'ready' && exportCaptions?.id ? `/v1/exports/${exportCaptions.id}` : undefined,
      blockedReason: captionsBlockedReason,
      minimumReady: captionsState === 'ready',
      fullyProcessed: isTerminalState(captionsState),
      pendingWork: isPendingState(captionsState)
        ? [toWorkItem({ label: 'Captioned video (All participants)', state: captionsState, reason: captionsBlockedReason })!]
        : [],
      failedWork: captionsState === 'action required'
        ? [toWorkItem({ label: 'Captioned video (All participants)', state: captionsState, reason: captionsBlockedReason })!]
        : [],
      actions: captionsActions,
    },
    exports: {
      requiredTotal: exportItems.length,
      ready,
      processing,
      actionRequired,
      items: exportItems,
    },
  };

  const pendingWork = [
    ...data.combinedAsset.pendingWork,
    ...data.participantAssets.flatMap((asset) => asset.pendingWork),
    ...data.transcript.pendingWork,
    ...data.captions.pendingWork,
    ...data.exports.items.flatMap((item) => item.pendingWork),
  ];
  const failedWork = [
    ...data.combinedAsset.failedWork,
    ...data.participantAssets.flatMap((asset) => asset.failedWork),
    ...data.transcript.failedWork,
    ...data.captions.failedWork,
    ...data.exports.items.flatMap((item) => item.failedWork),
  ];
  const minimumReady = data.combinedAsset.state === 'ready'
    && data.processingSummary.readyParticipantCount > 0;
  const fullyProcessed = minimumReady && pendingWork.length === 0;

  data.project.minimumReady = minimumReady;
  data.project.fullyProcessed = fullyProcessed;
  data.processingSummary.minimumReady = minimumReady;
  data.processingSummary.fullyProcessed = fullyProcessed;
  data.processingSummary.pendingWork = pendingWork;
  data.processingSummary.failedWork = failedWork;

  return { code: 'ok', data };
}
