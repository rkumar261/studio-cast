'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import LoginButton from '@/components/LoginButton';
import { AuthAPI } from '@/lib/api';
import { useSession } from '@/lib/useSession';

export default function Navbar() {
  const { profile, setProfile } = useSession();
  const isLoggedIn = !!profile;

  useEffect(() => {
    AuthAPI.me()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [setProfile]);

  async function handleLogout() {
    try {
      await AuthAPI.logout?.();
    } catch {
      // ignore
    } finally {
      setProfile(null);
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        {/* Left: brand + primary nav */}
        <div className="flex items-center gap-6">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-xs font-semibold text-white">
              rl
            </span>
            <span className="text-base font-semibold tracking-tight text-slate-900">
              riverside-lite
            </span>
          </Link>

          {/* Primary nav – always visible */}
          <nav className="flex items-center gap-4 pl-4 border-l border-slate-200">
            <Link
              href="/recordings"
              className={`text-sm font-semibold px-2 py-1 rounded-md ${
                isLoggedIn
                  ? 'text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-500'
              }`}
            >
              My recordings
            </Link>
            <Link
              href="/tech-check"
              className={`text-sm font-semibold px-2 py-1 rounded-md ${
                isLoggedIn
                  ? 'text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-500'
              }`}
            >
              Tech check
            </Link>
          </nav>
        </div>

        {/* Right: auth / profile */}
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <>
              <span className="text-sm text-gray-700">{profile!.email}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm"
              >
                Logout
              </button>
            </>
          ) : (
            <LoginButton className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm" />
          )}
        </div>
      </div>
    </header>
  );
}
