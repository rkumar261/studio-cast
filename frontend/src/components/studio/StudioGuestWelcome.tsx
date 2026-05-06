'use client';

import Link from 'next/link';

type StudioGuestWelcomeProps = {
  hasGuestToken: boolean;
  onContinue: () => void;
};

export function StudioGuestWelcome(props: StudioGuestWelcomeProps) {
  return (
    <main className="studio-shell-background min-h-screen text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[980px] flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="studio-control-surface rounded-full px-3 py-1.5 text-slate-300 hover:text-slate-100">
              ←
            </Link>
            <p className="text-2xl font-semibold tracking-[0.2em]">STUDIO CAST</p>
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center py-10">
          <div className="studio-panel-surface w-full max-w-2xl rounded-3xl p-10">
            <span className="inline-flex rounded-full border border-violet-400/40 bg-violet-500/10 px-4 py-2 text-sm text-violet-100">
              Guest Invite
            </span>
            <h1 className="mt-5 text-5xl font-semibold leading-tight">
              Join this recording as a guest
            </h1>
            <p className="mt-4 text-xl text-slate-300">
              You are joining as a guest participant. No account login is required for this invite.
            </p>
            <p className="mt-2 text-base text-slate-400">
              Continue to enter your details, run device checks, and join the studio session.
            </p>

            {!props.hasGuestToken && (
              <p className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                Guest invite token is missing. Ask host for a fresh invite link.
              </p>
            )}

            <button
              type="button"
              onClick={props.onContinue}
              disabled={!props.hasGuestToken}
              className="mt-7 w-full rounded-xl bg-[var(--workspace-purple)] px-4 py-3 text-xl font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              Continue as guest
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
