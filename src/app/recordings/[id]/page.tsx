'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  RecordingsAPI,
  ParticipantsAPI,
  type GetRecordingResponse,
  type GetParticipantsResponse,
  TracksAPI,
} from '@/lib/api';
import ParticipantsList from '@/components/ParticipantsList';
import AddParticipantForm from '@/components/AddParticipantForm';
import UploadInitiateCard from '@/components/UploadInitiateCard';
import { triggerDownloadFromUrl } from '@/lib/download';

export default function RecordingDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<GetRecordingResponse | null>(null);
  const [participants, setParticipants] =
    useState<GetParticipantsResponse['participants']>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load recording + participants using a concrete recording id
  const loadAll = useCallback(async (recId: string) => {
    const [rec, parts] = await Promise.all([
      RecordingsAPI.getById(recId),
      ParticipantsAPI.list(recId).catch(() => ({ participants: [] })),
    ]);
    setData(rec);
    setParticipants(parts.participants ?? []);
  }, []);

  useEffect(() => {
    if (typeof id === 'string') {
      loadAll(id);
    }

    // cleanup polling when leaving page
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [id, loadAll]);

  // Map participantId -> participant so we can show names in the track list
  const participantById = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of participants) {
      map.set(p.id, p);
    }
    return map;
  }, [participants]);

  if (!data) return <p>Loading…</p>;
  const r = data.recording;

  // Single call to backend -> presigned URL -> trigger iframe download
  async function handleDownload(trackId: string) {
    const { url } = await TracksAPI.finalUrl(trackId);
    triggerDownloadFromUrl(url);
  }

  function refreshParticipants(recId: string) {
    ParticipantsAPI.list(recId)
      .then((res) => setParticipants(res.participants ?? []))
      .catch(() => setParticipants([]));
  }

  // After an upload, poll tracks until they all become "processed"
  function startTrackPolling(recId: string) {
    if (pollRef.current) return; // already polling

    pollRef.current = setInterval(async () => {
      try {
        const rec = await RecordingsAPI.getById(recId);
        setData(rec);

        const allProcessed = rec.tracks.every((t) => t.state === 'processed');
        if (allProcessed && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // ignore transient errors while polling
      }
    }, 5000); // every 5s
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{r.title || '(untitled)'}</h1>
      <div className="text-sm text-gray-300">
        Status: <b>{r.status}</b> · Created: {new Date(r.createdAt).toLocaleString()}
      </div>

      {/* Participants */}
      <section className="space-y-3">
        <h2 className="font-semibold">Participants</h2>
        <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
          <div className="border rounded bg-white p-4 text-sm text-gray-900">
            <AddParticipantForm
              recordingId={r.id}
              onCreated={() => refreshParticipants(r.id)}
            />
          </div>
          <div className="border rounded bg-white p-4 text-sm text-gray-900">
            <ParticipantsList recordingId={r.id} />
          </div>
        </div>
      </section>

      {/* Uploads + Tracks */}
      <section className="space-y-3">
        <h2 className="font-semibold">Uploads</h2>
        <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
          {/* Upload controls */}
          <div className="border rounded bg-white p-4 text-sm text-gray-900">
            <UploadInitiateCard
              recordingId={r.id}
              participants={participants}
              onUploaded={() => {
                // refresh immediately after upload finishes
                loadAll(r.id);
                // then keep polling until tracks are processed
                startTrackPolling(r.id);
              }}
            />
          </div>

          {/* Tracks list */}
          <div className="border rounded bg-white p-4 text-sm text-gray-900">
            <section className="space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                Tracks
                <button
                  type="button"
                  className="ml-auto text-xs px-2 py-1 border rounded"
                  onClick={() => loadAll(r.id)}
                >
                  Refresh
                </button>
              </h2>

              <div className="border rounded bg-white p-4 text-sm text-gray-900">
                {data.tracks.length === 0 ? (
                  'No tracks yet (initiate upload from client when ready).'
                ) : (
                  <div className="divide-y">
                    {data.tracks.map((t, idx) => {
                      const canDownload = t.state === 'processed';
                      const p = participantById.get(t.participantId);
                      const label = p
                        ? `${p.role === 'host' ? 'Host' : 'Guest'} · ${
                            p.displayName || p.email || p.id
                          }`
                        : t.participantId;

                      return (
                        <div key={t.id} className="flex items-center gap-3 py-2">
                          <span className="w-10 text-xs text-gray-500">#{idx + 1}</span>
                          <span className="min-w-20 capitalize">{t.kind}</span>
                          <span className="text-sm text-gray-600">{t.state}</span>
                          <span className="text-xs text-gray-500">{label}</span>
                          <span className="text-xs text-gray-500">
                            {t.codec ? `codec: ${t.codec} ` : ''}
                            {typeof t.durationMs === 'number' ? `· ${t.durationMs}ms` : ''}
                          </span>
                          {canDownload && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDownload(t.id);
                              }}
                              className="ml-auto px-3 py-1.5 rounded bg-indigo-600 text-white"
                              title="Download the processed file"
                            >
                              Download
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
