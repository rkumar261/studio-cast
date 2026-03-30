'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  API_BASE,
  ExportsAPI,
  RecordingsAPI,
  type GetProjectAssetsGraphResponse,
  type GetRecordingResponse,
  type ProjectAssetActionDto,
  type ProjectAssetState,
  type RecordingProgressResponse,
} from '@/lib/api';
import { triggerDownloadFromUrl } from '@/lib/download';
import { consumerStateBadgeClass, toConsumerStateLabel } from '@/lib/recording-journey';

export type ProjectHeroViewModel = {
  label: string;
  state: ProjectAssetState;
  stateLabel: string;
  summary: string;
  durationLabel?: string;
  previewUrl?: string;
  rawPreviewUrl?: string;
  blockedReason?: string | null;
  actions: ProjectAssetActionDto[];
};

export type ProjectTrackRowViewModel = {
  id: string;
  title: string;
  subtitle: string;
  state: ProjectAssetState;
  stateLabel: string;
  blockedReason?: string | null;
  previewUrl?: string;
  warnings: string[];
  actions: ProjectAssetActionDto[];
};

export type ProjectArtifactRowViewModel = {
  id: string;
  title: string;
  kind: 'transcript' | 'captions' | 'export';
  state: ProjectAssetState;
  stateLabel: string;
  summary: string;
  blockedReason?: string | null;
  actions: ProjectAssetActionDto[];
};

export type ProjectProcessingBannerViewModel = {
  state: ProjectAssetState;
  stateLabel: string;
  summary: string;
  minimumReady?: boolean;
  fullyProcessed?: boolean;
  pending: string[];
  failed: string[];
  progress: {
    participantsComplete: number;
    participantsTotal: number;
    participantsUploading: number;
    actionRequiredParticipants: number;
  } | null;
};

export type ProjectWorkspaceViewModel = {
  id: string;
  title: string;
  createdAtLabel: string;
  projectState: ProjectAssetState;
  projectStateLabel: string;
  projectStateClass: string;
  hero: ProjectHeroViewModel | null;
  processingBanner?: ProjectProcessingBannerViewModel;
  tracks: ProjectTrackRowViewModel[];
  artifacts: ProjectArtifactRowViewModel[];
};

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== 'number' || durationMs <= 0) return undefined;
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatBlockedReason(reason?: string) {
  return reason?.trim() || undefined;
}

export function stateSummaryCopy(state: ProjectAssetState) {
  if (state === 'ready') return 'Your recording outputs are ready.';
  if (state === 'processing') return 'Processing is still running on your recording.';
  if (state === 'uploading') return 'Uploads are still being finalized before processing can continue.';
  if (state === 'action required') return 'This recording needs attention before it is fully ready.';
  return 'Recording is still in progress.';
}

function qualityWarningsForAsset(asset: GetProjectAssetsGraphResponse['participantAssets'][number]) {
  const warnings: string[] = [];

  if (asset.qualityWarnings?.audioWarning === 'no_audio_stream') {
    warnings.push('No audio detected');
  }
  if (asset.qualityWarnings?.videoWarning === 'black_video') {
    warnings.push('Video appears black');
  }
  if (asset.qualityWarnings?.videoWarning === 'insufficient_frames') {
    warnings.push('Very short video');
  }
  if (asset.qualityWarnings?.durationWarning) {
    warnings.push('Duration mismatch');
  }

  return warnings;
}

export function buildProjectWorkspaceViewModel(input: {
  recording: GetRecordingResponse['recording'];
  progress: RecordingProgressResponse | null;
  projectAssets: GetProjectAssetsGraphResponse | null;
}): ProjectWorkspaceViewModel {
  const { recording, progress, projectAssets } = input;
  const projectState = projectAssets?.project.state ?? progress?.projectState ?? 'uploading';
  const heroAsset = projectAssets?.combinedAsset;
  const processingSummary = projectAssets?.processingSummary;

  return {
    id: recording.id,
    title: recording.title?.trim() || 'Untitled project',
    createdAtLabel: new Date(recording.createdAt).toLocaleString(),
    projectState,
    projectStateLabel: toConsumerStateLabel(projectState),
    projectStateClass: consumerStateBadgeClass(projectState),
    hero: heroAsset
      ? {
          label: heroAsset.label,
          state: heroAsset.state,
          stateLabel: toConsumerStateLabel(heroAsset.state),
          summary:
            heroAsset.state === 'ready' && heroAsset.previewUrl
              ? 'Preview is available.'
              : heroAsset.rawPreviewUrl
                ? 'Preview is processing. Video is available while audio and derivatives finish.'
                : stateSummaryCopy(heroAsset.state),
          durationLabel: formatDuration(heroAsset.durationMs),
          previewUrl: heroAsset.previewUrl,
          rawPreviewUrl: heroAsset.rawPreviewUrl,
          blockedReason: formatBlockedReason(heroAsset.blockedReason),
          actions: heroAsset.state === 'ready' ? heroAsset.actions : [],
        }
      : null,
    processingBanner:
      projectState === 'ready' && !processingSummary
        ? undefined
        : {
            state: projectState,
            stateLabel: toConsumerStateLabel(projectState),
            summary: processingSummary?.minimumReady
              ? 'The project is usable now. Remaining derivatives can finish in the background.'
              : stateSummaryCopy(projectState),
            minimumReady: processingSummary?.minimumReady,
            fullyProcessed: processingSummary?.fullyProcessed,
            pending: processingSummary?.pendingWork.map((item) => item.label) ?? [],
            failed: processingSummary?.failedWork.map((item) => item.label) ?? [],
            progress: progress
              ? {
                  participantsComplete: progress.summary.participantsComplete,
                  participantsTotal: progress.summary.participantsTotal,
                  participantsUploading: progress.summary.participantsUploading,
                  actionRequiredParticipants: progress.summary.actionRequiredParticipants,
                }
              : null,
          },
    tracks:
      projectAssets?.participantAssets.map((asset) => ({
        id: asset.id,
        title: asset.participant?.name?.trim() || asset.label,
        subtitle: `${(asset.participant?.role || 'participant').toUpperCase()} · ${formatDuration(asset.durationMs) ?? 'Duration pending'}`,
        state: asset.state,
        stateLabel: toConsumerStateLabel(asset.state),
        blockedReason: formatBlockedReason(asset.blockedReason),
        previewUrl: asset.state === 'ready' ? asset.previewUrl : undefined,
        warnings: qualityWarningsForAsset(asset),
        actions: asset.state === 'ready' ? asset.actions : [],
      })) ?? [],
    artifacts: projectAssets
      ? [
          {
            id: projectAssets.transcript.id ?? 'transcript',
            title: projectAssets.transcript.label,
            kind: 'transcript',
            state: projectAssets.transcript.state,
            stateLabel: toConsumerStateLabel(projectAssets.transcript.state),
            summary:
              projectAssets.transcript.state === 'ready'
                ? 'Ready for preview or download.'
                : stateSummaryCopy(projectAssets.transcript.state),
            blockedReason: formatBlockedReason(projectAssets.transcript.blockedReason),
            actions:
              projectAssets.transcript.state === 'ready' ? projectAssets.transcript.actions : [],
          },
          {
            id: projectAssets.captions.id ?? 'captions',
            title: projectAssets.captions.label,
            kind: 'captions',
            state: projectAssets.captions.state,
            stateLabel: toConsumerStateLabel(projectAssets.captions.state),
            summary:
              projectAssets.captions.state === 'ready'
                ? 'Ready for preview or download.'
                : stateSummaryCopy(projectAssets.captions.state),
            blockedReason: formatBlockedReason(projectAssets.captions.blockedReason),
            actions:
              projectAssets.captions.state === 'ready' ? projectAssets.captions.actions : [],
          },
          ...projectAssets.exports.items.map((item) => ({
            id: item.id ?? item.type,
            title: item.label,
            kind: 'export' as const,
            state: item.state,
            stateLabel: toConsumerStateLabel(item.state),
            summary:
              item.state === 'ready' ? 'Download is available.' : stateSummaryCopy(item.state),
            blockedReason: formatBlockedReason(item.blockedReason),
            actions: item.state === 'ready' ? item.actions : [],
          })),
        ]
      : [],
  };
}

export default function useProjectWorkspace(recordingId?: string) {
  const [recording, setRecording] = useState<GetRecordingResponse | null>(null);
  const [progress, setProgress] = useState<RecordingProgressResponse | null>(null);
  const [projectAssets, setProjectAssets] = useState<GetProjectAssetsGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectAssetsError, setProjectAssetsError] = useState<string | null>(null);
  const [assetActionBusyId, setAssetActionBusyId] = useState<string | null>(null);
  const [assetActionError, setAssetActionError] = useState<string | null>(null);

  const refreshProjectAssets = useCallback(async (id: string) => {
    try {
      const graph = await RecordingsAPI.getProjectAssets(id);
      setProjectAssets(graph);
      setProjectAssetsError(null);
    } catch (projectError) {
      setProjectAssets(null);
      setProjectAssetsError(
        (projectError as Error).message || 'Failed to load project assets.'
      );
    }
  }, []);

  const refreshProject = useCallback(async () => {
    if (!recordingId) return;

    setLoading(true);
    setError(null);

    try {
      const [record, progressResponse] = await Promise.all([
        RecordingsAPI.getById(recordingId),
        RecordingsAPI.getProgress(recordingId).catch(() => null),
      ]);
      setRecording(record);
      setProgress(progressResponse);
      await refreshProjectAssets(recordingId);
    } catch (loadError) {
      setError((loadError as Error).message || 'Failed to load project.');
    } finally {
      setLoading(false);
    }
  }, [recordingId, refreshProjectAssets]);

  useEffect(() => {
    void refreshProject();
  }, [refreshProject]);

  useEffect(() => {
    if (!recordingId) return;

    const pollMs = progress?.projectState === 'processing' ? 1000 : 5000;
    const timer = window.setInterval(async () => {
      const [progressResponse, projectGraph] = await Promise.all([
        RecordingsAPI.getProgress(recordingId).catch(() => null),
        RecordingsAPI.getProjectAssets(recordingId).catch(() => null),
      ]);

      setProgress(progressResponse);
      if (projectGraph) {
        setProjectAssets(projectGraph);
        setProjectAssetsError(null);
      }
    }, pollMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [progress?.projectState, recordingId]);

  const handleAssetAction = useCallback(async (action: ProjectAssetActionDto) => {
    setAssetActionBusyId(action.id);
    setAssetActionError(null);

    try {
      if (action.kind === 'open_url') {
        window.open(action.href, '_blank', 'noopener,noreferrer');
        return;
      }

      if (action.kind === 'api' && action.href.startsWith('/v1/exports/')) {
        const exportId = action.href.split('/').pop();
        if (!exportId) return;
        const result = await ExportsAPI.getById(exportId);
        if (result.downloadUrl) {
          triggerDownloadFromUrl(result.downloadUrl);
        } else {
          triggerDownloadFromUrl(`${API_BASE}${action.href}`);
        }
        return;
      }

      if (action.kind === 'api') {
        triggerDownloadFromUrl(`${API_BASE}${action.href}`);
      }
    } catch (actionError) {
      setAssetActionError((actionError as Error).message || 'Action failed.');
    } finally {
      setAssetActionBusyId(null);
    }
  }, []);

  const viewModel = useMemo(
    () =>
      recording
        ? buildProjectWorkspaceViewModel({
            recording: recording.recording,
            progress,
            projectAssets,
          })
        : null,
    [projectAssets, progress, recording]
  );

  return {
    loading,
    error,
    projectAssetsError,
    assetActionBusyId,
    assetActionError,
    handleAssetAction,
    refreshProject,
    refreshProjectAssets: () => (recordingId ? refreshProjectAssets(recordingId) : Promise.resolve()),
    viewModel,
  };
}
