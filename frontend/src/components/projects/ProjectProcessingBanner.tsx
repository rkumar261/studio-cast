'use client';

import { useState } from 'react';
import type { ProjectProcessingBannerViewModel } from '@/lib/projects/useProjectWorkspace';

export default function ProjectProcessingBanner({
  banner,
}: {
  banner?: ProjectProcessingBannerViewModel;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!banner) return null;

  const pendingCount = banner.pending.length;
  const failedCount = banner.failed.length;
  const hasDetails = pendingCount > 0 || failedCount > 0;
  const isReady = banner.state === 'ready';

  return (
    <div
      className="overflow-hidden rounded-xl border border-white/6"
      data-testid="project-processing-banner"
    >
      {/* Slim one-line bar */}
      <div className={`flex items-center gap-3 px-4 py-2.5 ${isReady ? 'bg-emerald-500/5' : 'bg-violet-500/5'}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${isReady ? 'bg-emerald-400' : 'bg-violet-400 animate-pulse'}`} />
        <span className="flex-1 text-sm text-slate-300">{banner.summary}</span>
        {banner.progress && (
          <span className="text-xs text-slate-500">
            {banner.progress.participantsComplete}/{banner.progress.participantsTotal} participants
          </span>
        )}
        {hasDetails && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="ml-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {failedCount > 0 ? (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                {failedCount} failed
              </span>
            ) : (
              <span className="rounded-full border border-white/8 px-2 py-0.5">
                {pendingCount} pending
              </span>
            )}
            <svg
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="grid gap-4 border-t border-white/6 p-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Pending</p>
            {pendingCount > 0 ? (
              <ul className="space-y-1.5">
                {banner.pending.map((item, i) => (
                  <li key={`${item}-${i}`} className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="h-1 w-1 rounded-full bg-slate-500" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">None</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Failed</p>
            {failedCount > 0 ? (
              <ul className="space-y-1.5">
                {banner.failed.map((item, i) => (
                  <li key={`${item}-${i}`} className="flex items-center gap-2 text-sm text-amber-200">
                    <span className="h-1 w-1 rounded-full bg-amber-400" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">None</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
