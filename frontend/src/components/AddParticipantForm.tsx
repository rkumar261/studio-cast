'use client';
import { ParticipantsAPI } from '@/lib/api';
import { useRef, useState } from 'react';

type Props = {
  recordingId: string;
  /** called after a participant is successfully created */
  onCreated?: () => void;
};

export default function AddParticipantForm({ recordingId, onCreated }: Props) {
  const [role, setRole] = useState<'host' | 'guest'>('guest');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return alert('Please enter a display name');

    setBusy(true);
    try {
      const res = await ParticipantsAPI.create(recordingId, {
        role,
        displayName: displayName.trim(),
        email: email.trim() || undefined,
      });

      // reset fields
      setDisplayName('');
      setEmail('');
      nameRef.current?.focus();

      // notify parent to refresh list (used by RecordingDetailPage → UploadInitiateCard)
      onCreated?.();

      alert(res.magicLink ? `Guest link:\n${res.magicLink}` : 'Participant added');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <select
        className="border rounded px-2 py-2 bg-white text-gray-900"
        value={role}
        onChange={(e) => setRole(e.target.value as 'host' | 'guest')}
        disabled={busy}
      >
        <option value="guest">Guest</option>
        <option value="host">Host</option>
      </select>

      <input
        ref={nameRef}
        className="border rounded px-3 py-2 bg-white text-gray-900 placeholder:text-gray-500"
        placeholder="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        disabled={busy}
      />

      <input
        className="border rounded px-3 py-2 bg-white text-gray-900 placeholder:text-gray-500"
        placeholder="Email (optional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
      />

      <button
        className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
        disabled={busy}
      >
        {busy ? 'Adding…' : 'Add'}
      </button>
    </form>
  );
}
