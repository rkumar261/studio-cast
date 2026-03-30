'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from '@/lib/useSession';

type SidebarItem = {
  label: string;
  href: string;
  icon: ReactNode;
  match: (pathname: string) => boolean;
};

const sidebarItems: SidebarItem[] = [
  {
    label: 'Home',
    href: '/',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10.5V20h13v-9.5" />
      </svg>
    ),
    match: (pathname) => pathname === '/',
  },
  {
    label: 'Projects',
    href: '/projects',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 7.5h18v11A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z" />
        <path d="M3 7.5h5l1.5-2h4L15 7.5h6" />
      </svg>
    ),
    match: (pathname) => pathname === '/projects' || pathname.startsWith('/projects/'),
  },
  {
    label: 'Planner',
    href: '/recordings',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </svg>
    ),
    match: () => false,
  },
  {
    label: 'Hosting',
    href: '/recordings',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="2.5" />
        <path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0M12 17.5v2.5" />
      </svg>
    ),
    match: () => false,
  },
];

export default function WorkspaceSidebar() {
  const pathname = usePathname() ?? '/';
  const { profile, logout } = useSession();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountLabel = useMemo(
    () => profile?.name?.trim() || profile?.email?.trim() || 'Account',
    [profile]
  );
  const initials = profile?.name?.trim()?.charAt(0) || profile?.email?.trim()?.charAt(0) || 'S';

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  async function handleLogout() {
    setLogoutError(null);
    setLogoutBusy(true);

    try {
      await logout();
      window.location.replace('/');
    } catch (error) {
      setLogoutError((error as Error).message || 'Failed to log out.');
      setLogoutBusy(false);
    }
  }

  return (
    <aside className="sticky top-0 z-[70] flex h-screen w-[92px] shrink-0 flex-col items-center border-r border-white/5 bg-black/25 px-3 py-6">
      <Link
        href="/"
        aria-label="Studio Cast home"
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-100 shadow-[0_10px_30px_rgba(124,92,255,0.18)]"
      >
        <span className="text-lg font-semibold">SC</span>
      </Link>

      <nav className="flex w-full flex-1 flex-col items-center gap-3">
        {sidebarItems.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex w-full flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-[11px] font-medium transition ${
                active
                  ? 'bg-white/8 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-3">
        <button
          type="button"
          aria-label="Open help"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
        >
          <span className="text-xl">?</span>
        </button>
        <div ref={accountMenuRef} className="group relative flex flex-col items-center">
          {!accountMenuOpen && (
            <div
              data-testid="account-trigger-tooltip"
              className="pointer-events-none absolute bottom-1/2 left-[calc(100%+14px)] z-[95] hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-white/8 bg-[#1f1f22] px-4 py-2 text-sm font-medium text-white shadow-[0_18px_45px_rgba(0,0,0,0.35)] group-hover:flex group-focus-within:flex"
            >
              {accountLabel}
            </div>
          )}

          <button
            type="button"
            aria-label="Open account menu"
            aria-expanded={accountMenuOpen}
            aria-controls="workspace-account-menu"
            title={accountLabel}
            onClick={() => {
              setLogoutError(null);
              setAccountMenuOpen((current) => !current);
            }}
            className="group flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-semibold text-white transition hover:scale-[1.03] hover:shadow-[0_14px_36px_rgba(124,92,255,0.28)] focus:outline-none focus:ring-2 focus:ring-violet-400/60"
          >
            {initials.toUpperCase()}
          </button>

          {accountMenuOpen && (
            <div
              id="workspace-account-menu"
              data-testid="account-menu-popover"
              className="absolute bottom-0 left-[calc(100%+16px)] z-[110] w-72 rounded-[1.6rem] border border-white/8 bg-[#1f1f22] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.52)] backdrop-blur"
            >
              <div className="rounded-[1.2rem] border border-white/6 bg-white/[0.03] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Account</p>
                <p className="mt-2 line-clamp-1 text-base font-semibold text-white">
                  {profile?.name?.trim() || 'Studio Cast user'}
                </p>
                <p className="mt-1 line-clamp-1 text-sm text-slate-400">
                  {profile?.email?.trim() || 'Signed in'}
                </p>
              </div>

              <div className="mt-3 h-px bg-white/6" />

              <Link
                href="/settings"
                className="mt-3 flex w-full items-center gap-3 rounded-[1rem] px-4 py-3 text-left text-sm font-medium text-slate-100 transition hover:bg-white/[0.05]"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3.5" />
                  <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.3 1.3a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.8a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0L4.3 18a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H3.5a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.3-1.3a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.8a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.3 1.3a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1 1 0 0 1 1 1v1.8a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6Z" />
                </svg>
                <span>Settings</span>
              </Link>

              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={logoutBusy}
                className="flex w-full items-center gap-3 rounded-[1rem] px-4 py-3 text-left text-sm font-medium text-slate-100 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 16.5 20 12l-5-4.5" />
                  <path d="M9 12h11" />
                  <path d="M13 5H7.5A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19H13" />
                </svg>
                <span>{logoutBusy ? 'Logging out...' : 'Logout'}</span>
              </button>

              {logoutError && (
                <p className="px-4 pb-2 pt-1 text-xs text-rose-300">{logoutError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
