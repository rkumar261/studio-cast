'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import TranscriptPanel from '@/components/recordings/TranscriptPanel';
import ProjectFlatTrackList from '@/components/projects/ProjectFlatTrackList';
import ProjectHeader from '@/components/projects/ProjectHeader';
import ProjectHeroPreview from '@/components/projects/ProjectHeroPreview';
import ProjectProcessingBanner from '@/components/projects/ProjectProcessingBanner';
import useProjectWorkspace from '@/lib/projects/useProjectWorkspace';

export default function ProjectWorkspacePage() {
  const params = useParams<{ id: string }>();
  const recordingId = params?.id;
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const workspace = useProjectWorkspace(recordingId);

  if (workspace.loading) {
    return <p className="py-8 text-sm text-slate-400">Loading project...</p>;
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
    <div className="space-y-5 pb-8">
      {/* Header — breadcrumb + title + status */}
      <ProjectHeader
        title={viewModel.title}
        createdAtLabel={viewModel.createdAtLabel}
        statusLabel={viewModel.projectStateLabel}
        statusClassName={viewModel.projectStateClass}
        onRenameTitle={workspace.renameTitle}
      />

      {/* Slim processing banner — only shown while not fully ready */}
      {viewModel.processingBanner && (
        <ProjectProcessingBanner banner={viewModel.processingBanner} />
      )}

      <div className="space-y-6">
        {/* Meta + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{viewModel.createdAtLabel}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/studio/${viewModel.id}?mode=studio`}
              className="rounded-xl bg-[var(--workspace-purple)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Open studio
            </Link>
            <button
              type="button"
              onClick={() => void workspace.refreshProject()}
              className="rounded-xl border border-white/8 px-3 py-2 text-sm text-slate-300 hover:border-white/16 hover:text-white transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Error message */}
        {(workspace.assetActionError ?? workspace.projectAssetsError) && (
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {workspace.assetActionError ?? workspace.projectAssetsError}
          </div>
        )}

        {/* Preview first, tracks directly below */}
        <ProjectHeroPreview hero={viewModel.hero} videoRef={previewRef} />

        <ProjectFlatTrackList
          tracks={viewModel.tracks}
          artifacts={viewModel.artifacts}
          busyId={workspace.assetActionBusyId}
          onAction={workspace.handleAssetAction}
        />
      </div>

      {/* Transcript section */}
      <div className="pt-2">
        <TranscriptPanel
          recordingId={viewModel.id}
          onSeekToMs={seekPrimaryMediaTo}
          onSavedRevision={() => void workspace.refreshProjectAssets()}
        />
      </div>
    </div>
  );
}
