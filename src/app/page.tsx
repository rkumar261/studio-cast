'use client';

import Link from 'next/link';
import { useSession } from '@/lib/useSession';

const useCases = [
  'Podcasts',
  'Video interviews',
  'Remote classes',
  'Social clips',
  'Transcriptions',
  'Captions',
  'AI show notes (later)',
  'Magic clips (later)',
];

export default function HomePage() {
  const { profile } = useSession();
  const isLoggedIn = !!profile;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-950 text-slate-50">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-slate-950">
        <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 md:py-16">
        {/* Hero */}
        <section className="grid gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-center">
          {/* Left: headline + text + CTAs */}
          <div className="space-y-6">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold leading-tight">
              Create your best
              <br />
              remote recordings yet.
            </h1>

            <p className="text-sm sm:text-base text-slate-300 max-w-xl">
              riverside-lite is your in-browser studio for podcasts, interviews, and
              classes. Join a room, capture high-quality local tracks, and turn them into
              polished exports with transcripts and captions (Phase 1B).
            </p>

            {/* Small “what do you want to create” pills */}
            <div className="space-y-2 pt-2">
              <p className="text-xs text-slate-400 uppercase tracking-wide">
                What would you like to create?
              </p>
              <div className="flex flex-wrap gap-2">
                {useCases.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="rounded-full border border-slate-700 bg-slate-900/60 px-3.5 py-1.5 text-xs font-medium text-slate-100 hover:border-indigo-400 hover:bg-slate-900"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Single primary CTA below the pills */}
            <div className="pt-4">
              <div className="flex flex-col items-start sm:items-center gap-2">
                <Link
                  href={isLoggedIn ? '/recordings' : '/start'}
                  className="inline-flex items-center justify-center rounded-md bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600"
                >
                  Start for free
                </Link>
                <p className="text-[11px] text-slate-400">
                  No credit card needed. Local dev setup, open-source style.
                </p>
              </div>
            </div>
          </div>

          {/* Right: visual / “video” panel */}
          <div className="relative">
            <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4 shadow-2xl">
              {/* Fake video thumbnail */}
              <div className="relative h-56 sm:h-64 rounded-2xl bg-slate-950 overflow-hidden flex items-center justify-center">
                <div className="absolute inset-x-8 inset-y-6 grid grid-cols-2 gap-3 text-[11px] text-slate-100">
                  <div className="rounded-xl bg-slate-800/80 flex items-center justify-center">
                    Host
                  </div>
                  <div className="rounded-xl bg-slate-800/60 flex items-center justify-center">
                    Guest
                  </div>
                  <div className="rounded-xl bg-slate-900/80 flex items-center justify-center">
                    Screen share
                  </div>
                  <div className="rounded-xl bg-slate-900/60 flex items-center justify-center">
                    Chat / markers
                  </div>
                </div>
                {/* Play button */}
                <div className="absolute bottom-4 left-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-900">
                    ▶
                  </div>
                  <span className="text-[11px] text-slate-200">
                    Preview studio experience
                  </span>
                </div>
              </div>

              <p className="mt-4 text-xs text-slate-300">
                A lightweight studio inspired by tools like Riverside: host & guests,
                screen share, markers, uploads, and post-production — all on a simple
                Node + React stack.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
