import type { ProjectAssetActionDto } from '@/lib/api';
import type { ProjectTrackRowViewModel } from '@/lib/projects/useProjectWorkspace';

export default function ProjectTrackRow({
  track,
  busyId,
  onAction,
}: {
  track: ProjectTrackRowViewModel;
  busyId: string | null;
  onAction: (action: ProjectAssetActionDto) => Promise<void>;
}) {
  return (
    <article className="rounded-[1.2rem] border border-white/6 bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.04] text-sm font-semibold text-slate-300">
              {track.title.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-base font-semibold text-white">{track.title}</p>
              <p className="text-sm text-slate-500">{track.subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/8 px-2 py-1 text-[11px] text-slate-300">
              {track.stateLabel}
            </span>
            {track.warnings.map((warning) => (
              <span
                key={warning}
                className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100"
              >
                {warning}
              </span>
            ))}
          </div>
          {track.blockedReason && <p className="text-sm text-amber-100/80">{track.blockedReason}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {track.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={busyId === action.id}
              onClick={() => void onAction(action)}
              className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-slate-200 disabled:opacity-60"
            >
              {busyId === action.id ? 'Working...' : action.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}
