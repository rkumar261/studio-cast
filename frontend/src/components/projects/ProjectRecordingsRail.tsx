import Link from 'next/link';
import type { RecordingCardViewModel } from '@/lib/recording-card-view-model';
import ProjectRecordingMiniCard from '@/components/projects/ProjectRecordingMiniCard';

export default function ProjectRecordingsRail({
  recordings,
  loading,
  error,
}: {
  recordings: RecordingCardViewModel[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="space-y-5" data-testid="project-recordings-rail">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">Recordings</h2>
          <p className="mt-1 text-sm text-slate-500">
            Nearby work inside the same workspace flow.
          </p>
        </div>
        <Link
          href="/recordings"
          className="rounded-full border border-white/8 px-4 py-2 text-sm text-slate-300 hover:border-white/14 hover:text-white"
        >
          All recordings
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="aspect-[1.1/1] animate-pulse rounded-[1.3rem] border border-white/6 bg-white/[0.03]" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : recordings.length === 0 ? (
        <div className="rounded-[1.3rem] border border-dashed border-white/8 px-4 py-8 text-sm text-slate-400">
          No other recordings yet.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {recordings.map((recording) => (
            <ProjectRecordingMiniCard key={recording.id} card={recording} />
          ))}
        </div>
      )}
    </section>
  );
}
