import Link from 'next/link';
import type { AiToolCardViewModel } from '@/lib/dashboard/useHomeViewModel';

export default function DashboardAiToolCard({
  tool,
}: {
  tool: AiToolCardViewModel;
}) {
  const content = (
    <>
      <div className={`relative aspect-[1.2/1] ${tool.imageStyle}`}>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(9,10,15,0.92))]" />
        {tool.disabled && (
          <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-200">
            Soon
          </div>
        )}
      </div>
      <div className="space-y-3 px-5 py-5">
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-white">{tool.title}</h3>
          <p className="text-sm leading-6 text-slate-400">{tool.description}</p>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            {tool.disabled ? 'Unavailable' : 'Latest project'}
          </span>
          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              tool.disabled
                ? 'border-white/8 text-slate-500'
                : 'border-white/10 text-slate-200 group-hover:border-white/18 group-hover:text-white'
            }`}
          >
            {tool.ctaLabel}
          </span>
        </div>
      </div>
    </>
  );

  if (tool.href && !tool.disabled) {
    return (
      <Link
        href={tool.href}
        data-testid={`ai-tool-${tool.id}`}
        className="group block overflow-hidden rounded-[1.75rem] border border-white/6 bg-white/[0.025] transition-colors hover:border-white/12"
      >
        {content}
      </Link>
    );
  }

  return (
    <article
      data-testid={`ai-tool-${tool.id}`}
      data-disabled="true"
      className="overflow-hidden rounded-[1.75rem] border border-white/6 bg-white/[0.025] opacity-85"
    >
      {content}
    </article>
  );
}
