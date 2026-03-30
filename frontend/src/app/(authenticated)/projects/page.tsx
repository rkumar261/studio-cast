'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RecordingsAPI } from '@/lib/api';
import { toTrackAccentClass } from '@/lib/recording-card-view-model';
import useProjectRecordings from '@/lib/projects/useProjectRecordings';

export default function ProjectsIndexPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const projects = useProjectRecordings({ limit: 12, search });

  const visibleProjects = useMemo(() => projects.items, [projects.items]);

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
          <h1 className="text-4xl font-semibold tracking-tight text-white">Projects</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-400">
            Open a project to manage tracks, exports, transcript work, and every recording-related action in one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-white/6 bg-white/[0.03] p-1">
            <button
              type="button"
              className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm font-medium text-white"
            >
              Last created
            </button>
            <button
              type="button"
              aria-label="Grid view"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-slate-200"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 5h16M4 12h16M4 19h16" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Card view"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.1] text-white"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="6" height="6" rx="1.5" />
                <rect x="14" y="4" width="6" height="6" rx="1.5" />
                <rect x="4" y="14" width="6" height="6" rx="1.5" />
                <rect x="14" y="14" width="6" height="6" rx="1.5" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void createProject()}
            disabled={creating}
            className="rounded-2xl bg-[var(--workspace-purple)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {creating ? 'Creating...' : 'New project'}
          </button>
        </div>
      </header>

      <section className="space-y-5 rounded-[1.6rem] border border-white/6 bg-white/[0.03] p-5" data-testid="projects-index-grid">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Workspace</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Recent and active projects</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              className="w-full min-w-[260px] rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none"
            />
            <Link
              href="/recordings"
              className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-slate-200"
            >
              All recordings
            </Link>
          </div>
        </div>

        {createError && (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {createError}
          </div>
        )}

        {projects.loading ? (
          <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div key={index} className="overflow-hidden rounded-[1.5rem] border border-white/6 bg-white/[0.03] p-4">
                <div className="aspect-[1.18/1] animate-pulse rounded-[1.2rem] bg-white/[0.04]" />
              </div>
            ))}
          </div>
        ) : projects.error ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {projects.error}
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-white/8 px-5 py-10 text-sm text-slate-400">
            No projects matched your search.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
            {visibleProjects.map((project) => (
              <Link
                key={project.id}
                href={project.href}
                className="group overflow-hidden rounded-[1.5rem] border border-white/6 bg-white/[0.025] p-4 transition hover:border-white/12 hover:bg-white/[0.04]"
              >
                <div className="relative overflow-hidden rounded-[1.25rem] border border-white/6">
                  <div className="aspect-[1.18/1] bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.16),transparent_22%),linear-gradient(135deg,#c6c0ae,#d8d1bf_45%,#a4a0a0)] transition duration-300 group-hover:scale-[1.02]" />
                  <div className="absolute right-3 top-3">
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${toTrackAccentClass(project.state)}`}>
                      {project.stateLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="line-clamp-1 text-2xl font-semibold text-white">{project.title}</p>
                    <span className="text-sm text-slate-500">Open</span>
                  </div>
                  <p className="text-base text-slate-400">
                    Created {project.createdLabel ?? 'recently'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {projects.hasMore && (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => void projects.loadMore()}
              disabled={projects.loadingMore}
              className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-slate-200 disabled:opacity-60"
            >
              {projects.loadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
