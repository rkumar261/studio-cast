import type { RefObject } from 'react';
import type { ProjectHeroViewModel } from '@/lib/projects/useProjectWorkspace';

export default function ProjectHeroPreview({
  hero,
  videoRef,
}: {
  hero: ProjectHeroViewModel | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  if (!hero) {
    return (
      <section className="rounded-[1.75rem] border border-white/6 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-5">
        <div className="aspect-[16/10] rounded-[1.35rem] border border-white/5 bg-black/20 lg:aspect-[16/9.25]" />
      </section>
    );
  }

  return (
    <section className="rounded-[1.75rem] border border-white/6 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xl font-semibold text-white">{hero.label}</p>
          <p className="mt-1 text-sm text-slate-400">
            {hero.durationLabel ?? 'Duration pending'}
          </p>
        </div>
        <span className="rounded-full border border-white/8 px-3 py-1 text-xs text-slate-300">
          {hero.stateLabel}
        </span>
      </div>

      <div className="mt-3 aspect-[16/10] overflow-hidden rounded-[1.35rem] border border-white/6 bg-black/30 lg:aspect-[16/9.25]">
        {hero.previewUrl ? (
          <video
            ref={videoRef}
            className="h-full w-full bg-black object-contain"
            src={hero.previewUrl}
            controls
            preload="metadata"
          />
        ) : hero.rawPreviewUrl ? (
          <video
            ref={videoRef}
            className="h-full w-full bg-black object-contain opacity-90"
            src={hero.rawPreviewUrl}
            controls
            preload="metadata"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_20%),linear-gradient(135deg,#15161c,#0d0f14)] px-6 text-center text-sm text-slate-400">
            {hero.summary}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <p>{hero.summary}</p>
        {hero.blockedReason && <p className="text-amber-200/80">{hero.blockedReason}</p>}
      </div>
    </section>
  );
}
