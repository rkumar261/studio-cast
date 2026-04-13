import Link from 'next/link';
import type { AiToolCardViewModel } from '@/lib/dashboard/useHomeViewModel';
import DashboardAiToolCard from '@/components/dashboard/DashboardAiToolCard';

export default function DashboardAiToolsRail({
  tools,
  exploreHref,
}: {
  tools: AiToolCardViewModel[];
  exploreHref: string;
}) {
  return (
    <section className="space-y-5" data-testid="dashboard-ai-tools">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h2 className="text-[1.75rem] font-semibold tracking-tight text-white sm:text-[2rem]">AI tools</h2>
        <Link
          href={exploreHref}
          className="rounded-full border border-white/8 px-4 py-2 text-sm text-slate-300 hover:border-white/14 hover:text-white"
        >
          Open projects
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {tools.map((tool) => (
          <DashboardAiToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </section>
  );
}
