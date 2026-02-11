'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import LoginButton from '@/components/LoginButton';

type AuthMode = 'login' | 'register';

export default function StartPage() {
  const searchParams = useSearchParams();
  const initialMode = useMemo<AuthMode>(
    () => (searchParams.get('mode') === 'login' ? 'login' : 'register'),
    [searchParams]
  );

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [notice, setNotice] = useState<string | null>(null);

  function handleEmailAuth(e: FormEvent) {
    e.preventDefault();
    setNotice('Email/password auth API is not connected yet. Use Continue with Google for now.');
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-10 md:py-14">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 md:p-8 shadow-2xl space-y-6">
            <div className="space-y-2">
              <Link href="/" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200">
                ← Back
              </Link>
              <h1 className="text-2xl md:text-3xl font-semibold">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-sm text-slate-400">
                {mode === 'login'
                  ? 'Log in to continue to your studio.'
                  : 'Sign up and start recording in minutes.'}
              </p>
            </div>

            <LoginButton className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-white">
              <span>Continue with Google</span>
            </LoginButton>

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-slate-800" />
              <span>or continue with email</span>
              <span className="h-px flex-1 bg-slate-800" />
            </div>

            <div className="inline-flex rounded-full bg-slate-950/70 p-1 text-xs">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`rounded-full px-4 py-1.5 ${
                  mode === 'login'
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`rounded-full px-4 py-1.5 ${
                  mode === 'register'
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              {mode === 'register' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-200">Name</label>
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    placeholder="Your name"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-200">Email</label>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-200">Password</label>
                <input
                  type="password"
                  name="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'login' ? 'Enter your password' : 'Create a password'}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <button
                type="submit"
                className="mt-2 w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
              >
                {mode === 'login' ? 'Login with email' : 'Create account with email'}
              </button>

              {notice && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {notice}
                </p>
              )}
            </form>
          </section>

          <section className="hidden md:block rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              What you get
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                Record locally and collaborate remotely.
              </li>
              <li className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                Manage participants, uploads, transcript, and exports.
              </li>
              <li className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                Use Meet for instant calls and Studio for full recording workflow.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

