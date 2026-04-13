'use client';

import { useSession } from '@/lib/useSession';

export default function SettingsPage() {
  const { profile } = useSession();
  const accountLabel = profile?.name?.trim() || profile?.email?.trim() || 'Studio Cast account';

  return (
    <div className="space-y-8 pb-4">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Account</p>
        <h1 className="text-4xl font-semibold tracking-tight text-white">Settings</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">
          Account settings are minimal for now. This surface is here so the workspace account menu has a real destination.
        </p>
      </header>

      <section className="rounded-[1.6rem] border border-white/6 bg-white/[0.03] p-6">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Signed in as</p>
          <h2 className="text-2xl font-semibold text-white">{accountLabel}</h2>
          {profile?.email && profile?.name?.trim() ? (
            <p className="text-sm text-slate-400">{profile.email}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
