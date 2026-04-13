import type { ReactNode } from 'react';
import type { HomeViewModel } from '@/lib/dashboard/useHomeViewModel';

const ICONS: Record<string, ReactNode> = {
  record: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="5.5" />
    </svg>
  ),
  edit: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5 19 4-.8L18.2 9a1.8 1.8 0 0 0-2.5-2.5L6.5 15.7 5 19Z" />
      <path d="m13.5 8.5 2 2" />
    </svg>
  ),
  'go-live': (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="2.5" />
      <path d="M5.5 12a6.5 6.5 0 0 1 13 0M2.5 12a9.5 9.5 0 0 1 19 0" />
    </svg>
  ),
  schedule: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16M12 13v4M10 15h4" />
    </svg>
  ),
  upload: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16V6" />
      <path d="m8 10 4-4 4 4" />
      <path d="M5 18.5h14" />
    </svg>
  ),
};

export default function DashboardQuickActions({
  actions,
  busyAction,
  onQuickAction,
}: {
  actions: HomeViewModel['quickActions'];
  busyAction: HomeViewModel['busyAction'];
  onQuickAction: HomeViewModel['onQuickAction'];
}) {
  return (
    <section
      className="flex flex-col items-center justify-center gap-6 py-6 md:gap-8 md:py-12"
      data-testid="dashboard-quick-actions"
    >
      <div className="flex flex-wrap items-start justify-center gap-4 sm:gap-5 md:gap-8">
        {actions.map((action) => {
          const busy = busyAction === action.key;
          const primary = action.key === 'record';
          return (
            <button
              key={action.key}
              type="button"
              onClick={() => onQuickAction(action.key)}
              disabled={busyAction !== null}
              className="group flex w-[88px] flex-col items-center gap-2 text-center disabled:opacity-70 sm:w-[96px] md:w-[110px] md:gap-3"
            >
              <span
                className={`flex h-[72px] w-[72px] items-center justify-center rounded-full border transition sm:h-[80px] sm:w-[80px] md:h-[92px] md:w-[92px] ${
                  primary
                    ? 'border-rose-400/20 bg-rose-500/12 text-rose-200 shadow-[0_12px_30px_rgba(244,87,116,0.12)]'
                    : 'border-white/5 bg-white/[0.03] text-slate-100 group-hover:bg-white/[0.06]'
                }`}
              >
                {ICONS[action.key]}
              </span>
              <span className="text-sm font-semibold text-white sm:text-base md:text-lg">
                {busy ? 'Opening...' : action.label}
              </span>
              <span className="text-[11px] leading-4 text-slate-500 md:text-xs">{action.caption}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
