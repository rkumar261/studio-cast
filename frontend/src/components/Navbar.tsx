'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { AuthAPI } from '@/lib/api';
import { useSession } from '@/lib/useSession';
import { createRoomId } from '@/lib/studio/roomId';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, isLoading, setProfile } = useSession();
  const isLoggedIn = !!profile;

  if (pathname?.startsWith('/studio/')) {
    return null;
  }

  async function handleLogout() {
    try {
      await AuthAPI.logout?.();
    } catch {
      // ignore
    } finally {
      setProfile(null);
    }
  }

  function handleStartMeet() {
    if (!isLoggedIn) {
      router.push('/start');
      return;
    }
    const roomId = createRoomId('meet');
    router.push(`/studio/${roomId}?mode=meet`);
  }

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        {/* Left: brand + primary nav */}
        <div className="flex items-center gap-6">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-xs font-semibold text-white">
              SC
            </span>
            <span className="text-base font-semibold tracking-tight text-slate-900">
              Studio Cast
            </span>
          </Link>

          {!isLoading && (
            <nav className="flex items-center gap-4 pl-4 border-l border-slate-200">
              {isLoggedIn ? (
                <>
                  <Link
                    href="/recordings"
                    className="text-sm font-semibold px-2 py-1 rounded-md text-slate-900 hover:bg-slate-100"
                  >
                    Recording studio
                  </Link>
                  <button
                    type="button"
                    onClick={handleStartMeet}
                    className="text-sm font-semibold px-2 py-1 rounded-md text-slate-900 hover:bg-slate-100"
                  >
                    Meet
                  </button>
                  <Link
                    href="/tech-check"
                    className="text-sm font-semibold px-2 py-1 rounded-md text-slate-900 hover:bg-slate-100"
                  >
                    Tech check
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/" className="text-sm font-semibold px-2 py-1 rounded-md text-slate-700 hover:bg-slate-100">
                    Product
                  </Link>
                  <Link href="/" className="text-sm font-semibold px-2 py-1 rounded-md text-slate-700 hover:bg-slate-100">
                    Solutions
                  </Link>
                  <Link href="/" className="text-sm font-semibold px-2 py-1 rounded-md text-slate-700 hover:bg-slate-100">
                    Pricing
                  </Link>
                </>
              )}
            </nav>
          )}
        </div>

        {/* Right: auth / profile */}
        <div className="flex items-center gap-3">
          {isLoading ? (
            <span className="text-sm text-slate-400">Loading...</span>
          ) : isLoggedIn ? (
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
            <>
              <Link href="/start?mode=login" className="px-3 py-1.5 rounded text-sm text-slate-700 hover:bg-slate-100">
                Login
              </Link>
              <Link href="/start" className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm">
                Start for free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
