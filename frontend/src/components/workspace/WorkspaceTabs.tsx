import Link from 'next/link';

type WorkspaceTab = {
  label: string;
  href?: string;
  active?: boolean;
};

export default function WorkspaceTabs({ tabs }: { tabs: WorkspaceTab[] }) {
  return (
    <div className="flex flex-wrap items-center gap-6 border-b border-white/6 pb-3">
      {tabs.map((tab) =>
        tab.href ? (
          <Link
            key={tab.label}
            href={tab.href}
            className={`relative pb-2 text-sm font-medium transition ${
              tab.active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
            {tab.active && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white" />
            )}
          </Link>
        ) : (
          <span
            key={tab.label}
            className={`relative pb-2 text-sm font-medium ${
              tab.active ? 'text-white' : 'text-slate-400'
            }`}
          >
            {tab.label}
            {tab.active && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white" />
            )}
          </span>
        )
      )}
    </div>
  );
}
