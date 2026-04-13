import Link from 'next/link';
import type { HomeSecondaryCtaViewModel } from '@/lib/dashboard/useHomeViewModel';

export default function DashboardWorkspaceCta({
  cta,
}: {
  cta: HomeSecondaryCtaViewModel;
}) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center rounded-[1.75rem] border border-white/6 bg-white/[0.03] px-5 py-7 text-center sm:px-8 sm:py-8"
      data-testid="dashboard-workspace-cta"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-2xl bg-white/[0.04] p-3 text-2xl sm:p-4 sm:text-3xl">🗂️</span>
        <span className="rounded-2xl bg-white/[0.04] p-3 text-2xl sm:p-4 sm:text-3xl">⬆️</span>
      </div>
      <h3 className="mt-6 text-2xl font-semibold text-white sm:text-3xl">{cta.title}</h3>
      <p className="mt-3 max-w-md text-sm text-slate-400 sm:text-base">{cta.description}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={cta.primaryAction.href}
          className="rounded-2xl bg-[var(--workspace-purple)] px-5 py-3 text-sm font-semibold text-white"
        >
          {cta.primaryAction.label}
        </Link>
        <Link
          href={cta.secondaryAction.href}
          className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-3 text-sm font-semibold text-slate-200"
        >
          {cta.secondaryAction.label}
        </Link>
      </div>
    </div>
  );
}
