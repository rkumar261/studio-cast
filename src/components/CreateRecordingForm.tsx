'use client';
import { RecordingsAPI } from '@/lib/api';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateRecordingForm() {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { recording } = await RecordingsAPI.create(title.trim() || undefined);
      router.push(`/recordings/${recording.id}`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
         className="border rounded px-3 py-2 w-72 bg-white text-gray-900 placeholder:text-gray-500"
        placeholder="Session title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button disabled={busy} className="px-4 py-2 rounded bg-green-600 text-white">
        {busy ? 'Creating…' : 'New Recording'}
      </button>
    </form>
  );
}
