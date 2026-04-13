import type { ProjectAssetActionDto } from '@/lib/api';
import type { ProjectTrackRowViewModel } from '@/lib/projects/useProjectWorkspace';
import ProjectTrackRow from '@/components/projects/ProjectTrackRow';

export default function ProjectTracksPanel({
  tracks,
  busyId,
  onAction,
}: {
  tracks: ProjectTrackRowViewModel[];
  busyId: string | null;
  onAction: (action: ProjectAssetActionDto) => Promise<void>;
}) {
  return (
    <section className="space-y-5" data-testid="project-tracks-panel">
      <div>
        <h2 className="text-2xl font-semibold text-white">Tracks</h2>
        <p className="mt-1 text-sm text-slate-500">
          Participant-ready outputs and recording quality signals.
        </p>
      </div>

      {tracks.length === 0 ? (
        <div className="rounded-[1.3rem] border border-dashed border-white/8 px-4 py-8 text-sm text-slate-400">
          Participant outputs will appear here after processing starts.
        </div>
      ) : (
        <div className="space-y-3">
          {tracks.map((track) => (
            <ProjectTrackRow key={track.id} track={track} busyId={busyId} onAction={onAction} />
          ))}
        </div>
      )}
    </section>
  );
}
