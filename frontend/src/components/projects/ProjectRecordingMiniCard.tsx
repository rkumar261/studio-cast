import Link from 'next/link';
import type { RecordingCardViewModel } from '@/lib/recording-card-view-model';
import { toTrackAccentClass } from '@/lib/recording-card-view-model';

export default function ProjectRecordingMiniCard({
  card,
}: {
  card: RecordingCardViewModel;
}) {
  return (
    <Link
      href={card.href}
      className="block rounded-[1.3rem] border border-white/6 bg-white/[0.025] p-4 transition hover:border-white/12 hover:bg-white/[0.04]"
    >
      <div className="aspect-[1.25/1] rounded-[1rem] bg-[linear-gradient(135deg,#b9b39f,#ddd7c5_52%,#a1a0a7)]" />
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="line-clamp-1 text-lg font-semibold text-white">{card.title}</p>
          <span className={`rounded-full border px-2 py-1 text-[11px] ${toTrackAccentClass(card.state)}`}>
            {card.stateLabel}
          </span>
        </div>
        <p className="text-sm text-slate-400">Recorded {card.createdLabel ?? 'recently'}</p>
      </div>
    </Link>
  );
}
