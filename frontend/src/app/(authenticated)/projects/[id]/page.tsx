'use client';

import { useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import TranscriptPanel from '@/components/recordings/TranscriptPanel';
import ProjectActionBar from '@/components/projects/ProjectActionBar';
import ProjectArtifactsPanel from '@/components/projects/ProjectArtifactsPanel';
import ProjectHeader from '@/components/projects/ProjectHeader';
import ProjectHeroPreview from '@/components/projects/ProjectHeroPreview';
import ProjectProcessingBanner from '@/components/projects/ProjectProcessingBanner';
import ProjectRecordingsRail from '@/components/projects/ProjectRecordingsRail';
import ProjectTracksPanel from '@/components/projects/ProjectTracksPanel';
import WorkspaceTabs from '@/components/workspace/WorkspaceTabs';
import useProjectRecordings from '@/lib/projects/useProjectRecordings';
import useProjectWorkspace from '@/lib/projects/useProjectWorkspace';

export default function ProjectWorkspacePage() {
  const params = useParams<{ id: string }>();
  const recordingId = params?.id;
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const workspace = useProjectWorkspace(recordingId);
  const relatedRecordings = useProjectRecordings({ limit: 4, excludeId: recordingId });

  const tabs = useMemo(
    () => [
      { label: 'Recordings', active: true },
      { label: 'Tracks' },
      { label: 'Exports' },
      { label: 'Transcript' },
    ],
    []
  );

  if (workspace.loading) {
    return <p className="py-8 text-sm text-slate-400">Loading project workspace...</p>;
  }

  if (workspace.error || !workspace.viewModel) {
    return (
      <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
        {workspace.error ?? 'Unable to load this project.'}
      </div>
    );
  }

  const viewModel = workspace.viewModel;

  function seekPrimaryMediaTo(ms: number) {
    const video = previewRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, ms / 1000);
    void video.play().catch(() => {});
  }

  return (
    <div className="space-y-8 pb-4">
      <ProjectHeader
        title={viewModel.title}
        createdAtLabel={viewModel.createdAtLabel}
        statusLabel={viewModel.projectStateLabel}
        statusClassName={viewModel.projectStateClass}
      />

      <WorkspaceTabs tabs={tabs} />

      <ProjectProcessingBanner banner={viewModel.processingBanner} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
        <ProjectHeroPreview hero={viewModel.hero} videoRef={previewRef} />
        <ProjectActionBar
          recordingId={viewModel.id}
          actions={viewModel.hero?.actions ?? []}
          busyId={workspace.assetActionBusyId}
          actionError={workspace.assetActionError ?? workspace.projectAssetsError}
          onAction={workspace.handleAssetAction}
          onRefresh={workspace.refreshProject}
        />
      </div>

      <ProjectRecordingsRail
        recordings={relatedRecordings.items}
        loading={relatedRecordings.loading}
        error={relatedRecordings.error}
      />

      <ProjectTracksPanel
        tracks={viewModel.tracks}
        busyId={workspace.assetActionBusyId}
        onAction={workspace.handleAssetAction}
      />

      <ProjectArtifactsPanel
        artifacts={viewModel.artifacts}
        busyId={workspace.assetActionBusyId}
        onAction={workspace.handleAssetAction}
      />

      <TranscriptPanel
        recordingId={viewModel.id}
        onSeekToMs={seekPrimaryMediaTo}
        onSavedRevision={() => void workspace.refreshProjectAssets()}
      />
    </div>
  );
}
