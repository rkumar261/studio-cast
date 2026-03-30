import type { ProjectProcessingBannerViewModel } from '@/lib/projects/useProjectWorkspace';

export default function ProjectProcessingBanner({
  banner,
}: {
  banner?: ProjectProcessingBannerViewModel;
}) {
  if (!banner) return null;

  return (
    <section
      className="rounded-[1.5rem] border border-white/6 bg-white/[0.03] p-5"
      data-testid="project-processing-banner"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-100">
          {banner.stateLabel}
        </span>
        {typeof banner.minimumReady === 'boolean' && (
          <span className="rounded-full border border-white/8 px-3 py-1 text-xs text-slate-300">
            {banner.minimumReady ? 'Minimum ready' : 'Minimum ready pending'}
          </span>
        )}
        {typeof banner.fullyProcessed === 'boolean' && (
          <span className="rounded-full border border-white/8 px-3 py-1 text-xs text-slate-300">
            {banner.fullyProcessed ? 'Fully processed' : 'Processing continues'}
          </span>
        )}
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-300">{banner.summary}</p>

      {banner.progress && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/6 bg-black/10 px-4 py-3 text-sm text-slate-300">
            Participants complete: {banner.progress.participantsComplete}/
            {banner.progress.participantsTotal}
          </div>
          <div className="rounded-xl border border-white/6 bg-black/10 px-4 py-3 text-sm text-slate-300">
            Uploading now: {banner.progress.participantsUploading}
          </div>
          <div className="rounded-xl border border-white/6 bg-black/10 px-4 py-3 text-sm text-slate-300">
            Action required: {banner.progress.actionRequiredParticipants}
          </div>
        </div>
      )}

      {(banner.pending.length > 0 || banner.failed.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/6 bg-black/10 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Pending work</p>
            {banner.pending.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {banner.pending.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No pending work.</p>
            )}
          </div>
          <div className="rounded-xl border border-white/6 bg-black/10 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Failed work</p>
            {banner.failed.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {banner.failed.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No failed work.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
