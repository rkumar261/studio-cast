'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RecordingsAPI } from '@/lib/api';
import { toTrackAccentClass } from '@/lib/recording-card-view-model';
import useProjectRecordings from '@/lib/projects/useProjectRecordings';

export default function RecordingsArchivePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const archive = useProjectRecordings({ limit: 20, search: query });

  async function createProject() {
    setCreating(true);
    setCreateError(null);

    try {
      const { recording } = await RecordingsAPI.create();
      router.push(`/projects/${recording.id}`);
    } catch (error) {
      setCreateError((error as Error).message || 'Failed to create project.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8 pb-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">All recordings</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white">Recording archive</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-400">
            Browse every recording in one place. Open a project when you need the full
            workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void createProject()}
          disabled={creating}
          className="rounded-2xl bg-[var(--workspace-purple)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {creating ? 'Creating...' : 'Create project'}
        </button>
      </header>

      <section className="rounded-[1.5rem] border border-white/6 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold text-white">Archive</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search titles, scan state, and jump into the canonical project page.
            </p>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search recordings"
            aria-label="Search recordings"
            className="w-full max-w-sm rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none"
          />
        </div>

        {createError && (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {createError}
          </div>
        )}

        {archive.loading ? (
          <div className="mt-6 space-y-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-[1.2rem] border border-white/6 bg-white/[0.03]"
              />
            ))}
          </div>
        ) : archive.error ? (
          <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {archive.error}
          </div>
        ) : archive.items.length === 0 ? (
          <div className="mt-6 rounded-[1.2rem] border border-dashed border-white/8 px-4 py-10 text-sm text-slate-400">
            No recordings matched your search.
          </div>
        ) : (
          <div className="mt-6 space-y-3" data-testid="recordings-archive-list">
            {archive.items.map((item) => (
              <article
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-[1.2rem] border border-white/6 bg-white/[0.025] px-4 py-4"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="truncate text-lg font-semibold text-white">{item.title}</p>
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${toTrackAccentClass(item.state)}`}>
                      {item.stateLabel}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">Created {item.createdLabel ?? 'recently'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(item.href)}
                  className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-slate-200"
                >
                  Open project
                </button>
              </article>
            ))}
          </div>
        )}

        {archive.hasMore && (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void archive.loadMore()}
              disabled={archive.loadingMore}
              className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-slate-200 disabled:opacity-60"
            >
              {archive.loadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
