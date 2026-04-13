'use client';

type UploadStage =
  | 'idle'
  | 'creating'
  | 'preparing'
  | 'uploading'
  | 'finalizing'
  | 'complete'
  | 'error';

type UploadProgressProps = {
  stage: UploadStage;
  fileName?: string | null;
  progress: number;
  detail: string;
  projectHref?: string | null;
};

const STAGE_LABELS: Record<UploadStage, string> = {
  idle: 'Waiting for file',
  creating: 'Creating project shell',
  preparing: 'Preparing upload',
  uploading: 'Uploading media',
  finalizing: 'Finalizing project',
  complete: 'Upload complete',
  error: 'Upload failed',
};

export default function UploadProgress({
  stage,
  fileName,
  progress,
  detail,
  projectHref,
}: UploadProgressProps) {
  const progressWidth =
    stage === 'idle'
      ? 0
      : Math.max(8, Math.min(progress || (stage === 'complete' ? 100 : 8), 100));

  return (
    <section className="rounded-[1.75rem] border border-white/6 bg-white/[0.03] p-5">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Upload progress</p>
            <h2 className="text-2xl font-semibold text-white">{STAGE_LABELS[stage]}</h2>
            <p className="text-sm text-slate-400">{detail}</p>
          </div>
          <span className="rounded-full border border-white/8 bg-white/[0.02] px-3 py-1 text-sm text-slate-200">
            {Math.max(0, Math.min(progress, 100))}%
          </span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-white/[0.04]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--workspace-purple),#9a7dff)] transition-[width] duration-300"
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        <dl className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
          <div className="rounded-2xl border border-white/6 bg-black/10 px-4 py-3">
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">File</dt>
            <dd className="mt-1 font-medium text-white">{fileName ?? 'Waiting for selection'}</dd>
          </div>
          <div className="rounded-2xl border border-white/6 bg-black/10 px-4 py-3">
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Destination</dt>
            <dd className="mt-1 font-medium text-white">{projectHref ?? 'Project will be created after file selection'}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
