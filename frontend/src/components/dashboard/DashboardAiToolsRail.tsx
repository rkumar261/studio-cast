import type { AiToolCardViewModel } from '@/lib/dashboard/useHomeViewModel';
import DashboardAiToolCard from '@/components/dashboard/DashboardAiToolCard';

export default function DashboardAiToolsRail({
  tools,
}: {
  tools: AiToolCardViewModel[];
}) {
  return (
    <section className="space-y-5" data-testid="dashboard-ai-tools">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[2rem] font-semibold tracking-tight text-white">AI tools</h2>
        <button
          type="button"
          className="rounded-full border border-white/8 px-4 py-2 text-sm text-slate-300 hover:border-white/14 hover:text-white"
        >
          Explore all
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {tools.map((tool) => (
          <DashboardAiToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </section>
  );
}
