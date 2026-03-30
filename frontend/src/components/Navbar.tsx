'use client';

import Link from 'next/link';

export default function Navbar() {
  return (
    <header className="border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-xs font-semibold text-white">
              SC
            </span>
            <span className="text-base font-semibold tracking-tight text-slate-900">
              Studio Cast
            </span>
          </Link>

          <nav className="flex items-center gap-4 border-l border-slate-200 pl-4">
            <Link
              href="/"
              className="rounded-md px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Product
            </Link>
            <Link
              href="/"
              className="rounded-md px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Solutions
            </Link>
            <Link
              href="/"
              className="rounded-md px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Pricing
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/start?mode=login"
            className="rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            Login
          </Link>
          <Link href="/start" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white">
            Start for free
          </Link>
        </div>
      </div>
    </header>
  );
}
