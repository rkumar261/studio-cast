import Link from 'next/link';

export default function ProjectHeader({
  title,
  createdAtLabel,
  statusLabel,
  statusClassName,
}: {
  title: string;
  createdAtLabel: string;
  statusLabel: string;
  statusClassName: string;
}) {
  return (
    <header className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Link href="/projects" className="hover:text-slate-300">
              Projects
            </Link>
            <span>›</span>
            <span className="text-slate-300">{title}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-semibold tracking-tight text-white">{title}</h1>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClassName}`}>
              {statusLabel}
            </span>
          </div>
          <p className="text-sm text-slate-500">Created {createdAtLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/recordings"
            className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-slate-200"
          >
            All recordings
          </Link>
          <Link
            href="/"
            className="rounded-2xl bg-[var(--workspace-purple)] px-4 py-3 text-sm font-semibold text-white"
          >
            Home
          </Link>
        </div>
      </div>
    </header>
  );
}
