'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  RecordingsAPI,
  ParticipantsAPI,
  type GetRecordingResponse,
  type GetParticipantsResponse,
} from '@/lib/api';
import ParticipantsList from '@/components/ParticipantsList';
import AddParticipantForm from '@/components/AddParticipantForm';
import UploadInitiateCard from '@/components/UploadInitiateCard';

export default function RecordingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<GetRecordingResponse | null>(null);
  const [participants, setParticipants] =
    useState<GetParticipantsResponse['participants']>([]);
  
  const loadAll = useCallback(async () => {
    if (!id) return;
    const [rec, parts] = await Promise.all([
      RecordingsAPI.getById(id),
      ParticipantsAPI.list(id).catch(() => ({ participants: [] })),
    ]);
    setData(rec);
    setParticipants(parts.participants ?? []);
  }, [id]);

  function refreshParticipants(recId: string) {
    ParticipantsAPI.list(recId)
      .then(res => setParticipants(res.participants ?? []))
      .catch(() => setParticipants([]));
  }

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!data) return <p>Loading…</p>;

  const r = data.recording;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{r.title || '(untitled)'}</h1>
      <div className="text-sm text-gray-300">
        Status: <b>{r.status}</b> · Created: {new Date(r.createdAt).toLocaleString()}
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Participants</h2>
        {/* Notify page when a participant is created so we refresh the dropdown */}
        <AddParticipantForm
          recordingId={r.id}
          onCreated={() => refreshParticipants(r.id)}
        />
        <ParticipantsList recordingId={r.id} />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Uploads</h2>
        <UploadInitiateCard
          recordingId={r.id}
          participants={participants}
          onUploaded={loadAll}
        />
        {participants.length === 0 && (
          <p className="text-sm text-gray-400">
            No participants yet — add one above to start an upload.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Tracks</h2>
        <div className="border rounded bg-white p-4 text-sm text-gray-900">
          {data.tracks.length === 0 ? (
            'No tracks yet (initiate upload from client when ready).'
          ) : (
            <ul className="list-disc list-inside">
              {data.tracks.map(t => (
                <li key={t.id}>
                  {t.kind} · {t.state}
                  {t.codec ? ` · ${t.codec}` : ''}
                  {t.durationMs ? ` · ${t.durationMs}ms` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
