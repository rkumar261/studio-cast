import type { AiToolCardViewModel } from '@/lib/dashboard/useHomeViewModel';

export default function DashboardAiToolCard({
  tool,
}: {
  tool: AiToolCardViewModel;
}) {
  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-white/6 bg-white/[0.025]">
      <div className={`relative aspect-[1.2/1] ${tool.imageStyle}`}>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(9,10,15,0.92))]" />
      </div>
      <div className="space-y-2 px-5 py-5">
        <h3 className="text-2xl font-semibold text-white">{tool.title}</h3>
        <p className="text-sm leading-6 text-slate-400">{tool.description}</p>
      </div>
    </article>
  );
}
