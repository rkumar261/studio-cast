import Link from 'next/link';
import type { ProjectAssetActionDto } from '@/lib/api';

export default function ProjectActionBar({
  recordingId,
  actions,
  busyId,
  actionError,
  onAction,
  onRefresh,
}: {
  recordingId: string;
  actions: ProjectAssetActionDto[];
  busyId: string | null;
  actionError: string | null;
  onAction: (action: ProjectAssetActionDto) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/6 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/studio/${recordingId}?mode=studio`}
          className="rounded-2xl bg-[var(--workspace-purple)] px-4 py-3 text-sm font-semibold text-white"
        >
          Open studio
        </Link>
        {actions.map((action) => (
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
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-slate-200"
        >
          Refresh project
        </button>
      </div>

      {actionError && (
        <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {actionError}
        </div>
      )}
    </section>
  );
}
