'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  buildAuthRedirectHref,
  clearAuthRedirectCookie,
  normalizeAuthRedirectPath,
} from '@/lib/auth-redirect';
import { useSession } from '@/lib/useSession';

export default function PublicLandingPage() {
  const { profile, isLoading } = useSession();
  const searchParams = useSearchParams();
  const nextPath = normalizeAuthRedirectPath(searchParams.get('next'));
  const startHref = buildAuthRedirectHref('/start', nextPath);
  const loginHref = `/start?${new URLSearchParams({
    mode: 'login',
    ...(nextPath ? { next: nextPath } : {}),
  }).toString()}`;

  useEffect(() => {
    if (!isLoading && profile) {
      clearAuthRedirectCookie();
      window.location.replace(nextPath ?? '/');
    }
  }, [isLoading, nextPath, profile]);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-950 text-slate-50">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,#312113_0%,#171717_46%,#09090b_100%)]" />
        <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-amber-200/10 to-transparent" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
                href={startHref}
                className="rounded-xl bg-violet-500 px-6 py-3 text-base font-semibold text-white hover:bg-violet-400"
              >
                Start for free
              </Link>
              <Link
                href={loginHref}
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
