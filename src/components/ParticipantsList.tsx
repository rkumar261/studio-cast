'use client';
import { useEffect, useState } from 'react';
import { ParticipantsAPI, type GetParticipantsResponse } from '@/lib/api';

export default function ParticipantsList({ recordingId }: { recordingId: string }) {
  const [data, setData] = useState<GetParticipantsResponse | null>(null);

  useEffect(() => {
    ParticipantsAPI.list(recordingId).then(setData).catch(err => console.error(err));
  }, [recordingId]);

  return (
    <div className="border rounded bg-white text-gray-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left bg-gray-100 text-gray-700">
            <th className="px-4 py-2">Role</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Email</th>
          </tr>
        </thead>
        <tbody>
          {data?.participants.map(p => (
            <tr key={p.id} className="border-t">
              <td className="px-4 py-2">{p.role}</td>
              <td className="px-4 py-2">{p.displayName || '-'}</td>
              <td className="px-4 py-2">{p.email || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}