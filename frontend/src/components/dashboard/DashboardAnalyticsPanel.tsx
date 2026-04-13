import DashboardWorkspaceCta from '@/components/dashboard/DashboardWorkspaceCta';
import type {
  AnalyticsSummaryData,
  HomeSecondaryCtaViewModel,
} from '@/lib/dashboard/useHomeViewModel';

export default function DashboardAnalyticsPanel({
  data,
  cta,
}: {
  data?: AnalyticsSummaryData;
  cta: HomeSecondaryCtaViewModel;
}) {
  return (
    <section className="space-y-5" data-testid="dashboard-analytics">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[1.75rem] font-semibold tracking-tight text-white sm:text-[2rem]">Analytics</h2>
        {!data && (
          <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-violet-100">
            Coming soon
          </span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-[1.75rem] border border-white/6 bg-white/[0.03] p-7">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
            <div>
              <p className="text-sm font-medium text-slate-400">Total projects</p>
              <p className="mt-4 text-5xl font-semibold text-white sm:text-6xl">
                {data?.projectCount ?? 0}
              </p>
            </div>
            {data && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-white/8 px-3 py-1 text-xs text-slate-300">
                  {data.totalMinutesRecorded} min recorded
                </div>
                {data.lastRecordingAt && (
                  <div className="rounded-full border border-white/8 px-3 py-1 text-xs text-slate-300">
                    Last recording {data.lastRecordingAt}
                  </div>
                )}
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

        <DashboardWorkspaceCta cta={cta} />
      </div>
    </section>
  );
}
