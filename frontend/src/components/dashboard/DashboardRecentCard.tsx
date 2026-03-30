import Link from 'next/link';
import type { RecordingCardViewModel } from '@/lib/recording-card-view-model';
import { toTrackAccentClass } from '@/lib/recording-card-view-model';

export default function DashboardRecentCard({
  card,
}: {
  card: RecordingCardViewModel;
}) {
  return (
    <article
      className="group rounded-[1.5rem] border border-white/6 bg-white/[0.025] p-3"
      data-testid={`recent-card-${card.id}`}
    >
      <Link
        href={card.href}
        className="relative block overflow-hidden rounded-[1.25rem] border border-white/6"
      >
        <div className="aspect-[1.25/1] bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.16),transparent_22%),linear-gradient(135deg,#c6c0ae,#d8d1bf_45%,#a4a0a0)] transition duration-300 group-hover:scale-[1.02]" />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 via-black/20 to-transparent px-3 py-3">
          <span className="rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur">
            {card.primaryAction?.label ?? 'Open project'}
          </span>
          {card.durationLabel && (
            <span className="rounded-full bg-black/45 px-2 py-1 text-[11px] text-slate-100 backdrop-blur">
              {card.durationLabel}
            </span>
          )}
        </div>
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xl font-semibold text-white">{card.title}</p>
          <p className="text-sm text-slate-400">
            Recorded {card.createdLabel ?? 'recently'}
          </p>
          <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] ${toTrackAccentClass(card.state)}`}>
            {card.stateLabel}
          </span>
        </div>
        <Link
          href={card.href}
          className="rounded-full border border-white/8 px-3 py-2 text-xs text-slate-300 hover:border-white/14 hover:text-white"
        >
          Open project
        </Link>
      </div>
    </article>
  );
}
