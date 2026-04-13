import Link from 'next/link';
import type { RecordingCardViewModel } from '@/lib/recording-card-view-model';
import DashboardRecentCard from '@/components/dashboard/DashboardRecentCard';

export default function DashboardRecentGrid({
  cards,
  isLoading,
  error,
}: {
  cards: RecordingCardViewModel[];
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <section className="space-y-5" data-testid="dashboard-recents">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h2 className="text-[1.75rem] font-semibold tracking-tight text-white sm:text-[2rem]">Recents</h2>
        <Link
          href="/recordings"
          className="rounded-full border border-white/8 px-4 py-2 text-sm text-slate-300 hover:border-white/14 hover:text-white"
        >
          All recordings
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {[0, 1].map((index) => (
            <div key={index} className="overflow-hidden rounded-[1.5rem] border border-white/6 bg-white/[0.03]">
              <div className="aspect-[1.25/1] animate-pulse bg-white/[0.04]" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-white/8 bg-white/[0.02] px-5 py-10 text-sm text-slate-400">
          No projects yet. Start with <span className="font-semibold text-white">Record</span>.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {cards.map((card) => (
            <DashboardRecentCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}
