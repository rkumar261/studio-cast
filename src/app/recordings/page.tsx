'use client';
import { useEffect, useState } from 'react';
import { RecordingsAPI, type ListRecordingsResponse } from '@/lib/api';
import CreateRecordingForm from '@/components/CreateRecordingForm';
import Link from 'next/link';

export default function RecordingsPage() {
  const [data, setData] = useState<ListRecordingsResponse | null>(null);

  async function load(cursor?: string) {
    const res = await RecordingsAPI.listMine(20, cursor);
    setData(res);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My Recordings</h1>
      <CreateRecordingForm />
      <div className="border rounded bg-white">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-left">
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Created</th>
          </tr></thead>
          <tbody>
            {data?.items.map(r => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">
                  <Link href={`/recordings/${r.id}`} className="text-indigo-600 hover:underline">
                    {r.title || '(untitled)'}
                  </Link>
                </td>
                <td className="px-4 py-2">{r.status}</td>
                <td className="px-4 py-2">{new Date(r.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.nextCursor && (
        <button className="px-4 py-2 rounded bg-gray-200" onClick={() => load(data.nextCursor)}>
          Load more
        </button>
      )}
    </div>
  );
}
