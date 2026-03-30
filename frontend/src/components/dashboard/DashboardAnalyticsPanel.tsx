import DashboardPodcastCta from '@/components/dashboard/DashboardPodcastCta';
import type { AnalyticsSummaryData } from '@/lib/dashboard/useHomeViewModel';

export default function DashboardAnalyticsPanel({
  data,
}: {
  data?: AnalyticsSummaryData;
}) {
  return (
    <section className="space-y-5" data-testid="dashboard-analytics">
      <div className="flex items-center gap-3">
        <h2 className="text-[2rem] font-semibold tracking-tight text-white">Analytics</h2>
        {!data && (
          <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-violet-100">
            Coming soon
          </span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-[1.75rem] border border-white/6 bg-white/[0.03] p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-400">Total streams</p>
              <p className="mt-4 text-6xl font-semibold text-white">
                {data?.episodeCount ?? 0}
              </p>
            </div>
            {data && (
              <div className="rounded-full border border-white/8 px-3 py-1 text-xs text-slate-300">
                Last recording {data.lastRecordingAt}
              </div>
            )}
          </div>
          <div className="mt-10 space-y-5">
            {[0, 1, 2, 3].map((line) => (
              <div key={line} className="h-px w-full bg-white/10" />
            ))}
          </div>
          <div className="mt-9 h-1 rounded-full bg-[var(--workspace-purple)]" />
        </div>

        <DashboardPodcastCta />
      </div>
    </section>
  );
}
