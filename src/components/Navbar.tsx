'use client';
import { useEffect } from 'react';
import LoginButton from '@/components/LoginButton';
import { AuthAPI } from '@/lib/api';
import { useSession } from '@/lib/useSession';

export default function Navbar() {
  const { profile, setProfile } = useSession();

  useEffect(() => {
    AuthAPI.me()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [setProfile]);

  async function handleLogout() {
    try {
      await AuthAPI.logout?.(); // if you have it; otherwise call fetch('/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* ignore */
    } finally {
      setProfile(null);
      // Optional: force reload so cookies/session state are fresh across app
      // window.location.href = '/';
    }
  }

  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <div className="font-semibold">riverside-lite</div>

        <div className="flex items-center gap-3">
          {profile ? (
            <>
              <span className="text-sm text-gray-700">{profile.email}</span>
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
