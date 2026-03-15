'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RecordingsAPI, type ListRecordingsResponse, type ProjectAssetState } from '@/lib/api';
import { consumerStateBadgeClass, toConsumerStateLabel } from '@/lib/recording-journey';

type ProjectCardSummary = {
  combinedState: ProjectAssetState;
  participantReady: number;
  participantTotal: number;
  exportsReady: number;
  exportsTotal: number;
};

export default function RecordingsPage() {
  const router = useRouter();
  const [data, setData] = useState<ListRecordingsResponse | null>(null);
  const [summaries, setSummaries] = useState<Record<string, ProjectCardSummary>>({});
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSummaries(items: ListRecordingsResponse['items']) {
    const rows = await Promise.all(
      items.map(async (item) => {
        try {
          const graph = await RecordingsAPI.getProjectAssets(item.id);
          return [
            item.id,
            {
              combinedState: graph.combinedAsset.state,
              participantReady: graph.participantAssets.filter((a) => a.state === 'ready').length,
              participantTotal: graph.participantAssets.length,
              exportsReady: graph.exports.ready,
              exportsTotal: graph.exports.requiredTotal,
            } satisfies ProjectCardSummary,
          ] as const;
        } catch {
          return [item.id, null] as const;
        }
      })
    );

    setSummaries((prev) => {
      const next = { ...prev };
      for (const [id, summary] of rows) {
        if (summary) next[id] = summary;
      }
      return next;
    });
  }

  async function load(cursor?: string) {
    const res = await RecordingsAPI.listMine(20, cursor);
    setData(res);
    loadSummaries(res.items ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createRecording() {
    setError(null);
    setCreating(true);
    try {
      const { recording } = await RecordingsAPI.create(title.trim() || undefined);
      setTitle('');
      router.push(`/recordings/${recording.id}`);
    } catch (err) {
      setError((err as Error).message || 'Failed to create recording.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Recordings</h1>
          <p className="text-sm text-slate-400">
            Create a new session or open any recording detail page.
          </p>
        </header>

        <section className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-slate-400">
              Session title (optional)
            </label>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              placeholder="Weekly interview with guest"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={createRecording}
            disabled={creating}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400 disabled:opacity-60"
          >
            {creating ? 'Creating...' : 'Record new'}
          </button>
        </section>

        {error && (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <section className="space-y-3">
          {data?.items.length ? (
            <div className="space-y-3">
              {data.items.map((r) => (
                <article
                  key={r.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  {(() => {
                    const summary = summaries[r.id];
                    return (
                      <div className="mb-3 grid gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400">Primary output</span>
                          <span className={`rounded-full border px-2 py-0.5 ${consumerStateBadgeClass(summary?.combinedState ?? 'processing')}`}>
                            {toConsumerStateLabel(summary?.combinedState ?? 'processing')}
                          </span>
                        </div>
                        <div className="text-slate-300">
                          Participant outputs: {summary?.participantReady ?? 0}/{summary?.participantTotal ?? 0} ready
                        </div>
                        <div className="text-slate-300">
                          Required exports: {summary?.exportsReady ?? 0}/{summary?.exportsTotal ?? 0} ready
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Link
                        href={`/recordings/${r.id}`}
                        className="text-base font-semibold text-slate-100 hover:text-cyan-300"
                      >
                        {r.title || '(untitled recording)'}
                      </Link>
                      <p className="text-xs text-slate-400">ID: {r.id}</p>
                      <p className="text-xs text-slate-500">
                        Created {new Date(r.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Link
                      href={`/recordings/${r.id}`}
                      className="rounded-md border border-slate-600 px-3 py-1.5 text-slate-200 hover:border-cyan-400"
                    >
                      Open details
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-sm text-slate-400">
              No recordings yet. Create one from the panel above.
            </div>
          )}
        </section>

        {data?.nextCursor && (
          <button
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            onClick={() => load(data.nextCursor)}
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
