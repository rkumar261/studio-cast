'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RecordingsAPI, type ListRecordingsResponse } from '@/lib/api';
import { useSession } from '@/lib/useSession';
import { createRoomId } from '@/lib/studio/roomId';
type BusyAction = 'record' | 'meet' | 'upload' | null;

export default function HomePage() {
  const router = useRouter();
  const { profile, isLoading } = useSession();
  const isLoggedIn = !!profile;

  const [recents, setRecents] = useState<ListRecordingsResponse['items']>([]);
  const [loadingRecents, setLoadingRecents] = useState(false);
  const [errorRecents, setErrorRecents] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setRecents([]);
      return;
    }

    let active = true;
    setLoadingRecents(true);
    setErrorRecents(null);

    RecordingsAPI.listMine(6)
      .then((res) => {
        if (!active) return;
        setRecents(res.items ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setErrorRecents((err as Error).message || 'Failed to load recordings.');
      })
      .finally(() => {
        if (!active) return;
        setLoadingRecents(false);
      });

    return () => {
      active = false;
    };
  }, [isLoggedIn]);

  const latestRecordingId = recents[0]?.id;

  async function handleRecordAction() {
    setActionError(null);
    setBusyAction('record');
    try {
      const { recording } = await RecordingsAPI.create();
      router.push(`/studio/${recording.id}?mode=studio`);
    } catch (err) {
      setActionError((err as Error).message || 'Failed to prepare studio.');
    } finally {
      setBusyAction(null);
    }
  }

  function handleMeetAction() {
    setActionError(null);
    setBusyAction('meet');
    const roomId = createRoomId('meet');
    router.push(`/studio/${roomId}?mode=meet`);
    setBusyAction(null);
  }

  function handleUploadAction() {
    setActionError(null);
    setBusyAction('upload');
    router.push(latestRecordingId ? `/recordings/${latestRecordingId}#uploads` : '/recordings');
    setBusyAction(null);
  }

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-slate-950 text-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-sm text-slate-400">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-slate-950 text-slate-50">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,#312113_0%,#171717_46%,#09090b_100%)]" />
          <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-amber-200/10 to-transparent" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
          <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center">
            <div className="space-y-6">
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl">
                Create your
                <br />
                best content yet.
              </h1>
              <p className="max-w-xl text-base text-slate-200/90">
                Studio Cast is an AI Enabled Recording Studio for recording, collaboration,
                track uploads, and clean exports from one browser workflow.
              </p>
              <div className="flex flex-wrap gap-2 text-sm">
                {['Podcasts', 'Interviews', 'Webinars', 'Social clips', 'Transcriptions'].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/25 bg-black/20 px-4 py-2 text-slate-100"
                    >
                      {tag}
                    </span>
                  )
                )}
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Link
                  href="/start"
                  className="rounded-xl bg-violet-500 px-6 py-3 text-base font-semibold text-white hover:bg-violet-400"
                >
                  Start for free
                </Link>
                <Link
                  href="/start?mode=login"
                  className="rounded-xl border border-white/30 px-6 py-3 text-base text-slate-100 hover:bg-white/10"
                >
                  Login
                </Link>
              </div>
              <p className="text-sm text-slate-300">No credit card needed.</p>
            </div>

            <div className="h-[520px] rounded-3xl border border-white/15 bg-gradient-to-br from-slate-800/70 via-slate-900/70 to-black/80 p-4">
              <div className="h-full w-full rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,200,120,.18),transparent_40%),linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.01))]" />
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0f1013] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Home</h1>
          <p className="text-sm text-slate-400">
            Choose an action and continue from your recent recordings.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-[#13151a] p-5">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleRecordAction}
              disabled={busyAction !== null}
              className="group flex min-w-[150px] flex-col items-center justify-center gap-2 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-5 py-4 text-center transition hover:border-rose-300 disabled:opacity-60"
            >
              <span className="text-base font-semibold">Record</span>
              <span className="text-xs text-slate-300">
                {busyAction === 'record' ? 'Preparing studio...' : 'Cam/mic check before joining'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleMeetAction}
              disabled={busyAction !== null}
              className="group flex min-w-[150px] flex-col items-center justify-center gap-2 rounded-2xl border border-cyan-400/40 bg-cyan-500/10 px-5 py-4 text-center transition hover:border-cyan-300 disabled:opacity-60"
            >
              <span className="text-base font-semibold">Meet</span>
              <span className="text-xs text-slate-300">Start instant video meeting</span>
            </button>

            <button
              type="button"
              onClick={handleUploadAction}
              disabled={busyAction !== null}
              className="group flex min-w-[150px] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 px-5 py-4 text-center transition hover:border-slate-500 disabled:opacity-60"
            >
              <span className="text-base font-semibold">Upload</span>
              <span className="text-xs text-slate-300">
                {latestRecordingId ? 'Upload into latest recording' : 'Open recording studio first'}
              </span>
            </button>
          </div>
          {actionError && (
            <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {actionError}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Recents</h2>
            <Link
              href="/recordings"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
            >
              Open recording studio
            </Link>
          </div>

          {loadingRecents ? (
            <p className="text-sm text-slate-400">Loading recent recordings...</p>
          ) : errorRecents ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {errorRecents}
            </p>
          ) : recents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-[#13151a] p-6 text-sm text-slate-400">
              No recordings yet. Start with <b>Record</b>.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recents.map((recording) => (
                <article
                  key={recording.id}
                  className="rounded-2xl border border-slate-800 bg-[#13151a] p-3"
                >
                  <Link
                    href={`/recordings/${recording.id}`}
                    className="block overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
                  >
                    <div className="aspect-video bg-[radial-gradient(circle_at_30%_20%,rgba(100,120,160,.35),rgba(30,35,45,.7))]" />
                  </Link>

                  <div className="space-y-1 pt-3">
                    <p className="line-clamp-1 text-base font-semibold text-slate-100">
                      {recording.title || '(untitled recording)'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(recording.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="pt-3 flex gap-2 text-xs">
                    <Link
                      href={`/recordings/${recording.id}`}
                      className="rounded-md border border-slate-700 px-2.5 py-1.5 text-slate-200 hover:border-cyan-400"
                    >
                      Open
                    </Link>
                    <Link
                      href={`/studio/${recording.id}?mode=studio`}
                      className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-200 hover:border-emerald-300"
                    >
                      Studio
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
