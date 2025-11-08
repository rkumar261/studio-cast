'use client';
import Link from 'next/link';
import { useSession } from '@/lib/useSession';

export default function HomePage() {
  const { profile } = useSession();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Welcome to riverside-lite</h1>
      {profile ? (
        <div className="space-y-3">
          <p className="text-gray-700">You’re signed in as <b>{profile.email}</b>.</p>
          <Link href="/recordings" className="inline-block px-4 py-2 rounded bg-indigo-600 text-white">My Recordings</Link>
        </div>
      ) : (
        <p className="text-gray-600">Please sign in to manage your recordings.</p>
      )}
    </div>
  );
}
