'use client';

import type { ProjectAssetActionDto } from '@/lib/api';
import type {
  ProjectTrackRowViewModel,
  ProjectArtifactRowViewModel,
} from '@/lib/projects/useProjectWorkspace';

function TrackFlatRow({
  track,
  busyId,
  onAction,
}: {
  track: ProjectTrackRowViewModel;
  busyId: string | null;
  onAction: (action: ProjectAssetActionDto) => Promise<void>;
}) {
  const isReady = track.state === 'ready';
  return (
    <div className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-sm font-semibold text-slate-300">
          {track.title.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{track.title}</p>
          <p className="text-xs text-slate-500">{track.subtitle}</p>
          {track.warnings.length > 0 && (
            <p className="mt-0.5 text-xs text-amber-300">{track.warnings.join(' · ')}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:ml-auto sm:flex-nowrap">
        <div className="flex shrink-0 items-center gap-1.5">
          {isReady ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Ready
            </span>
          ) : (
            <span className="text-xs text-slate-500">{track.stateLabel}</span>
          )}
        </div>

        {track.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={busyId === action.id}
            onClick={() => void onAction(action)}
            className="flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/16 hover:text-white disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {busyId === action.id ? '...' : action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ArtifactFlatRow({
  artifact,
  busyId,
  onAction,
}: {
  artifact: ProjectArtifactRowViewModel;
  busyId: string | null;
  onAction: (action: ProjectAssetActionDto) => Promise<void>;
}) {
  const isReady = artifact.state === 'ready';
  const icon =
    artifact.kind === 'transcript' ? (
      <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
      </svg>
    ) : artifact.kind === 'captions' ? (
      <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ) : (
      <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );

  return (
    <div className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.04]">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{artifact.title}</p>
          {artifact.blockedReason && (
            <p className="text-xs text-amber-300">{artifact.blockedReason}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:ml-auto sm:flex-nowrap">
        <div className="flex shrink-0 items-center gap-1.5">
          {isReady ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Ready
            </span>
          ) : (
            <span className="text-xs text-slate-500">{artifact.stateLabel}</span>
          )}
        </div>

        {artifact.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={busyId === action.id}
            onClick={() => void onAction(action)}
            className="flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/16 hover:text-white disabled:opacity-50"
          >
            {busyId === action.id ? '...' : action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ProjectFlatTrackList({
  tracks,
  artifacts,
  busyId,
  onAction,
}: {
  tracks: ProjectTrackRowViewModel[];
  artifacts: ProjectArtifactRowViewModel[];
  busyId: string | null;
  onAction: (action: ProjectAssetActionDto) => Promise<void>;
}) {
  const hasContent = tracks.length > 0 || artifacts.length > 0;

  return (
    <section data-testid="project-track-list">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
        Tracks
      </p>
      <div className="overflow-hidden rounded-2xl border border-white/6 divide-y divide-white/[0.04]">
        {!hasContent && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            Outputs will appear here as processing completes.
          </div>
        )}
        {tracks.map((track) => (
          <TrackFlatRow key={track.id} track={track} busyId={busyId} onAction={onAction} />
        ))}
        {artifacts.map((artifact) => (
          <ArtifactFlatRow key={artifact.id} artifact={artifact} busyId={busyId} onAction={onAction} />
        ))}
      </div>
    </section>
  );
}
