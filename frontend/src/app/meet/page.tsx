'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createRoomId } from '@/lib/studio/roomId';
import { useSession } from '@/lib/useSession';

export default function MeetLauncherPage() {
  const router = useRouter();
  const { profile } = useSession();
  const isLoggedIn = !!profile;

  const [roomIdInput, setRoomIdInput] = useState('');
  const [busy, setBusy] = useState(false);

  function goToMeetRoom(roomId: string) {
    const normalized = roomId.trim();
    if (!normalized) return;
    router.push(`/studio/${encodeURIComponent(normalized)}?mode=meet`);
  }

  function handleInstantMeet() {
    if (!isLoggedIn) {
      router.push('/start');
      return;
    }

    setBusy(true);
    const roomId = createRoomId('meet');
    goToMeetRoom(roomId);
  }

  function handleJoinExisting(e: FormEvent) {
    e.preventDefault();
    if (!isLoggedIn) {
      router.push('/start');
      return;
    }
    goToMeetRoom(roomIdInput);
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Meet</h1>
          <p className="text-sm text-slate-400">
            Launch an instant room or join an existing room ID.
          </p>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm font-semibold text-slate-100">Instant meet</p>
            <p className="mt-1 text-xs text-slate-400">
              Create a fresh room and jump in immediately.
            </p>
            <button
              type="button"
              onClick={handleInstantMeet}
              disabled={busy}
              className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
            >
              {busy ? 'Opening...' : 'Start instant meet'}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm font-semibold text-slate-100">Join existing room</p>
            <p className="mt-1 text-xs text-slate-400">Use a room ID shared by your team.</p>

            <form onSubmit={handleJoinExisting} className="mt-4 space-y-2">
              <input
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder="meet-xxxxxxxx"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400"
              >
                Join room
              </button>
            </form>
          </div>
        </section>

        <div className="mt-5 text-xs text-slate-400">
          Need a recording workflow instead?{' '}
          <Link href="/recordings" className="text-cyan-300 hover:text-cyan-200">
            Open recordings
          </Link>
        </div>
      </div>
    </div>
  );
}

