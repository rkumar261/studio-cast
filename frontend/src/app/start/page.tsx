'use client';

import { FormEvent } from 'react';
import LoginButton from '@/components/LoginButton';

export default function StartPage() {
    function handleEmailSignup(e: FormEvent) {
        e.preventDefault();
        // TODO: wire to backend signup API later
        console.log('Email signup submit (UI only for now)');
    }

    return (
        <div className="min-h-[calc(100vh-56px)] bg-slate-950 text-slate-50">
            <div className="mx-auto max-w-5xl px-4 py-10 md:py-16">
                <div className="grid gap-8 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start">
                    {/* Left: signup card */}
                    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 md:p-8 shadow-2xl space-y-6">
                        <div className="space-y-2">
                            <button
                                type="button"
                                className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200"
                                onClick={() => {
                                    window.history.back();
                                }}
                            >
                                ← Back
                            </button>
                            <h1 className="text-2xl md:text-3xl font-semibold">
                                Create your account
                            </h1>
                            <p className="text-sm text-slate-400">
                                Sign up to join the studio. No credit card needed.
                            </p>
                        </div>

                        {/* Social / Google auth */}
                        <div className="space-y-3">
                            <LoginButton className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-white">
                                <span>Continue with Google</span>
                            </LoginButton>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="h-px flex-1 bg-slate-800" />
                            <span>or continue with email</span>
                            <span className="h-px flex-1 bg-slate-800" />
                        </div>

                        {/* Email signup form (UI only) */}
                        <form onSubmit={handleEmailSignup} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-200">Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    autoComplete="name"
                                    placeholder="Your name"
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-200">Email</label>
                                <input
                                    type="email"
                                    name="email"
                                    autoComplete="email"
                                    placeholder="you@example.com"
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-200">Password</label>
                                <input
                                    type="password"
                                    name="password"
                                    autoComplete="new-password"
                                    placeholder="Create a password"
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>

                            <button
                                type="submit"
                                className="mt-2 w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600"
                            >
                                Create your account
                            </button>

                            <p className="text-xs text-slate-500 pt-1">
                                By signing up, you agree to the usual terms and privacy policy. We’ll wire
                                this form to the backend signup endpoint later.
                            </p>

                            <p className="text-xs text-slate-500">
                                Already have an account?{' '}
                                <button
                                    type="button"
                                    className="text-slate-200 underline-offset-2 hover:underline"
                                    onClick={() => {
                                        console.log('Login clicked (UI only)');
                                    }}
                                >
                                    Log in
                                </button>
                            </p>
                        </form>
                    </section>

                    {/* Right: preview / marketing card */}
                    <section className="hidden md:flex items-center">
                        <div className="w-full rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-5 shadow-2xl">
                            <div className="mb-4 text-xs font-medium text-slate-300 uppercase tracking-wide">
                                Studio preview
                            </div>

                            <div className="relative h-52 rounded-2xl bg-slate-950 overflow-hidden">
                                {/* Fake transcript / waveform view */}
                                <div className="absolute inset-0 grid grid-rows-[1fr_auto]">
                                    <div className="px-4 py-3 space-y-1 text-[11px] text-slate-200">
                                        <div className="flex gap-2">
                                            <span className="text-slate-500">00:10</span>
                                            <span className="font-semibold text-emerald-300">Kendall</span>
                                            <span className="bg-purple-500/30 px-1 rounded">
                                                Studio-quality recording.
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-slate-500">00:22</span>
                                            <span className="font-semibold text-sky-300">Daniel</span>
                                            <span>Editing that feels effortless.</span>
                                        </div>
                                    </div>
                                    <div className="px-4 pb-3 flex items-end">
                                        <div className="h-12 w-full rounded-xl bg-slate-900 flex items-center">
                                            <div className="flex-1 flex items-center gap-1 px-3">
                                                {/* Fake waveform bars */}
                                                {Array.from({ length: 30 }).map((_, i) => (
                                                    <span
                                                        key={i}
                                                        className="w-[3px] rounded-full bg-slate-600"
                                                        style={{
                                                            height: `${6 + (i % 5) * 4}px`,
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                            <button className="mx-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 text-xs font-semibold">
                                                ▶
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <p className="mt-4 text-xs text-slate-300">
                                Record, upload, transcribe, and export — all from a browser studio. Once
                                Phase 1 is complete, ASR, captions, and magic clips plug right into this
                                flow.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
