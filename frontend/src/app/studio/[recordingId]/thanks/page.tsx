'use client';

import Link from 'next/link';
import { Space_Grotesk } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export default function StudioGuestThanksPage() {
  return (
    <main className={`${spaceGrotesk.className} flex min-h-screen items-center justify-center bg-[#07090f] px-6 text-slate-100`}>
      <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-[#111620] p-8 text-center">
        <p className="text-5xl font-semibold">All set!</p>
        <p className="mt-4 text-lg text-slate-300">
          Your recording upload is complete. You can close this tab now.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex rounded-xl border border-slate-700 bg-[#1b2230] px-4 py-2 text-sm text-slate-100 hover:border-slate-500"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
