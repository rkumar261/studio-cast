'use client';

import { useMemo } from 'react';
import { buildProjectWorkspaceViewModel, formatBlockedReason, stateSummaryCopy } from '@/lib/projects/project-workspace.mapper';
import { useProjectWorkspaceActions } from '@/lib/projects/useProjectWorkspaceActions';
import { useProjectWorkspaceQuery } from '@/lib/projects/useProjectWorkspaceQuery';

export { buildProjectWorkspaceViewModel, formatBlockedReason, stateSummaryCopy };
export type {
  ProjectArtifactRowViewModel,
  ProjectHeroViewModel,
  ProjectProcessingBannerViewModel,
  ProjectTrackRowViewModel,
  ProjectWorkspaceViewModel,
} from '@/lib/projects/project-workspace.types';

export default function useProjectWorkspace(recordingId?: string) {
  const query = useProjectWorkspaceQuery(recordingId);
  const actions = useProjectWorkspaceActions({
    recordingId,
    setRecording: query.setRecording,
  });

  const viewModel = useMemo(
    () =>
      query.recording
        ? buildProjectWorkspaceViewModel({
            recording: query.recording.recording,
            progress: query.progress,
            projectAssets: query.projectAssets,
          })
        : null,
    [query.projectAssets, query.progress, query.recording]
  );

  return {
    loading: query.loading,
    error: query.error,
    projectAssetsError: query.projectAssetsError,
    assetActionBusyId: actions.assetActionBusyId,
    assetActionError: actions.assetActionError,
    handleAssetAction: actions.handleAssetAction,
    renameTitle: actions.renameTitle,
    refreshProject: query.refreshProject,
    refreshProjectAssets: query.refreshProjectAssets,
    viewModel,
  };
}
