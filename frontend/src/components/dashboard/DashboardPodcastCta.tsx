export default function DashboardPodcastCta() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-[1.75rem] border border-white/6 bg-white/[0.03] px-8 py-8 text-center">
      <div className="flex items-center gap-2">
        <span className="rounded-2xl bg-white/[0.04] p-4 text-3xl">🎧</span>
        <span className="rounded-2xl bg-white/[0.04] p-4 text-3xl">📡</span>
      </div>
      <h3 className="mt-6 text-3xl font-semibold text-white">Host your podcast on Studio Cast</h3>
      <p className="mt-3 max-w-md text-base text-slate-400">
        Get publishing-ready analytics and delivery workflows from one place once podcast
        hosting ships.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          className="rounded-2xl bg-[var(--workspace-purple)] px-5 py-3 text-sm font-semibold text-white"
        >
          Set up podcast
        </button>
        <button
          type="button"
          className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-3 text-sm font-semibold text-slate-200"
        >
          Import podcast
        </button>
      </div>
    </div>
  );
}
