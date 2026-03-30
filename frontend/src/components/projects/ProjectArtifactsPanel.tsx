import type { ProjectAssetActionDto } from '@/lib/api';
import type { ProjectArtifactRowViewModel } from '@/lib/projects/useProjectWorkspace';
import ProjectArtifactRow from '@/components/projects/ProjectArtifactRow';

export default function ProjectArtifactsPanel({
  artifacts,
  busyId,
  onAction,
}: {
  artifacts: ProjectArtifactRowViewModel[];
  busyId: string | null;
  onAction: (action: ProjectAssetActionDto) => Promise<void>;
}) {
  return (
    <section className="space-y-5" data-testid="project-artifacts-panel">
      <div>
        <h2 className="text-2xl font-semibold text-white">Transcript, captions, and exports</h2>
        <p className="mt-1 text-sm text-slate-500">
          Manage transcript delivery, captions, and exported derivatives.
        </p>
      </div>

      {artifacts.length === 0 ? (
        <div className="rounded-[1.3rem] border border-dashed border-white/8 px-4 py-8 text-sm text-slate-400">
          Artifact rows will appear here as processing continues.
        </div>
      ) : (
        <div className="space-y-3">
          {artifacts.map((artifact) => (
            <ProjectArtifactRow
              key={artifact.id}
              artifact={artifact}
              busyId={busyId}
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </section>
  );
}
