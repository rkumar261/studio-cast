'use client';

import type { GetProjectAssetsGraphResponse, ProjectAssetState } from '@/lib/api';
import { formatRecordingTitle } from '@/lib/recording-card-view-model';
import { consumerStateBadgeClass, toConsumerStateLabel } from '@/lib/recording-journey';
import type { ProjectWorkspaceInput, ProjectWorkspaceViewModel, ProjectArtifactRowViewModel } from '@/lib/projects/project-workspace.types';

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

function normalizeArtifactLabel(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function buildExportArtifacts(projectAssets: GetProjectAssetsGraphResponse): ProjectArtifactRowViewModel[] {
  const captionLabel = normalizeArtifactLabel(projectAssets.captions.label);

  return projectAssets.exports.items.reduce<ProjectArtifactRowViewModel[]>((items, item) => {
    if (item.type === 'mp4_captions') return items;
    if (normalizeArtifactLabel(item.label) === captionLabel) return items;

    items.push({
      id: item.id ?? item.type,
      title: item.label,
      kind: 'export',
      state: item.state,
      stateLabel: toConsumerStateLabel(item.state),
      summary: item.state === 'ready' ? 'Download is available.' : stateSummaryCopy(item.state),
      blockedReason: formatBlockedReason(item.blockedReason),
      actions: item.state === 'ready' ? item.actions : [],
    });

    return items;
  }, []);
}

export function buildProjectWorkspaceViewModel(input: ProjectWorkspaceInput): ProjectWorkspaceViewModel {
  const { recording, progress, projectAssets } = input;
  const projectState = projectAssets?.project.state ?? progress?.projectState ?? 'uploading';
  const heroAsset = projectAssets?.combinedAsset;
  const processingSummary = projectAssets?.processingSummary;
  const exportArtifacts = projectAssets ? buildExportArtifacts(projectAssets) : [];

  return {
    id: recording.id,
    title: formatRecordingTitle(
      recording.title,
      (projectAssets?.participantAssets ?? [])
        .map((asset) => asset.participant?.name?.trim())
        .filter((name): name is string => Boolean(name)),
      recording.createdAt
    ),
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
            actions: projectAssets.captions.state === 'ready' ? projectAssets.captions.actions : [],
          },
          ...exportArtifacts,
        ]
      : [],
  };
}
