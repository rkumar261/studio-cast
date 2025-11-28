'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  RecordingsAPI,
  ParticipantsAPI,
  type GetRecordingResponse,
  type GetParticipantsResponse,
  TracksAPI,
  TranscriptAPI,
  ExportsAPI,
  type GetTranscriptResponse,
  type ExportDto,
} from '@/lib/api';
import ParticipantsList from '@/components/ParticipantsList';
import AddParticipantForm from '@/components/AddParticipantForm';
import UploadInitiateCard from '@/components/UploadInitiateCard';
import { triggerDownloadFromUrl } from '@/lib/download';

type ParticipantItem = GetParticipantsResponse['participants'][number];

export default function RecordingDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<GetRecordingResponse | null>(null);
  const [participants, setParticipants] =
    useState<GetParticipantsResponse['participants']>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [transcript, setTranscript] = useState<GetTranscriptResponse | null>(null);
  const [exportsList, setExportsList] = useState<ExportDto[]>([]);
  const [creatingExportType, setCreatingExportType] = useState<string | null>(null);

  // Load recording + participants (core data)
  const loadAll = useCallback(
    async (recId: string) => {
      const [rec, parts] = await Promise.all([
        RecordingsAPI.getById(recId),
        ParticipantsAPI.list(recId).catch(() => ({ participants: [] })),
      ]);
      setData(rec);
      setParticipants(parts.participants ?? []);

      // Also refresh transcript + exports for this recording
      refreshTranscript(recId);
      refreshExports(recId);
    },
    [], // no deps, uses functions defined below (function declarations are hoisted)
  );

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
    const map = new Map<string, ParticipantItem>();
    for (const p of participants) {
      map.set(p.id, p);
    }
    return map;
  }, [participants]);

  if (!data) return <p>Loading…</p>;
  const r = data.recording;

  // Track download (processed track final URL)
  async function handleDownload(trackId: string) {
    const { url } = await TracksAPI.finalUrl(trackId);
    triggerDownloadFromUrl(url);
  }

  function refreshParticipants(recId: string) {
    ParticipantsAPI.list(recId)
      .then((res) => setParticipants(res.participants ?? []))
      .catch(() => setParticipants([]));
  }

  function refreshTranscript(recId: string) {
    TranscriptAPI.getForRecording(recId)
      .then(setTranscript)
      .catch(() => setTranscript(null));
  }

  function refreshExports(recId: string) {
    ExportsAPI.listForRecording(recId)
      .then((res) => setExportsList(res.exports ?? []))
      .catch(() => setExportsList([]));
  }

  // After an upload, poll tracks until they all become "processed"
  function startTrackPolling(recId: string) {
    if (pollRef.current) return; // already polling

    pollRef.current = setInterval(async () => {
      try {
        const rec = await RecordingsAPI.getById(recId);
        setData(rec);

        // Any tracks still waiting to be processed?
        const anyPending = rec.tracks.some((t) => t.state === 'uploaded');

        // If nothing is pending, stop polling.
        if (!anyPending && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // ignore transient errors while polling
      }
    }, 5000); // every 5 seconds
  }


  async function handleCreateExport(type: 'wav' | 'mp4' | 'mp4_captions') {
    if (typeof id !== 'string') return;

    try {
      setCreatingExportType(type);
      const res = await ExportsAPI.create(id, type);

      setExportsList((prev) => {
        const existing = prev.find((e) => e.id === res.export.id);
        if (existing) {
          return prev.map((e) =>
            e.id === res.export.id ? res.export : e,
          );
        }
        return [...prev, res.export];
      });
    } finally {
      setCreatingExportType(null);
    }
  }

  async function handleDownloadExport(exp: ExportDto) {
    const full = await ExportsAPI.getById(exp.id);
    if (full.downloadUrl) {
      triggerDownloadFromUrl(full.downloadUrl);
    }
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
                        ? `${p.role === 'host' ? 'Host' : 'Guest'} · ${p.displayName || p.email || p.id
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

      {/* Transcript */}
      <section className="space-y-3">
        <h2 className="font-semibold">Transcript</h2>
        {!transcript || transcript.segments.length === 0 ? (
          <div className="text-sm text-gray-400">
            No transcript yet. It will appear here after processing.
          </div>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto border border-gray-700 rounded p-3 text-sm">
            {transcript.segments.map((seg) => (
              <div key={seg.id} className="flex gap-2">
                <span className="text-gray-400 shrink-0">
                  {Math.round(seg.startMs / 1000)}s–{Math.round(seg.endMs / 1000)}s
                </span>
                <span>{seg.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Exports */}
      <section className="space-y-3">
        <h2 className="font-semibold">Exports</h2>

        <div className="flex gap-2 text-sm">
          <button
            className="px-3 py-1 rounded border border-gray-600 hover:bg-gray-800 disabled:opacity-50"
            disabled={!!creatingExportType}
            onClick={() => handleCreateExport('wav')}
          >
            {creatingExportType === 'wav' ? 'Creating WAV…' : 'Create WAV'}
          </button>
          <button
            className="px-3 py-1 rounded border border-gray-600 hover:bg-gray-800 disabled:opacity-50"
            disabled={!!creatingExportType}
            onClick={() => handleCreateExport('mp4')}
          >
            {creatingExportType === 'mp4' ? 'Creating MP4…' : 'Create MP4'}
          </button>
          <button
            className="px-3 py-1 rounded border border-gray-600 hover:bg-gray-800 disabled:opacity-50"
            disabled={!!creatingExportType}
            onClick={() => handleCreateExport('mp4_captions')}
          >
            {creatingExportType === 'mp4_captions'
              ? 'Creating MP4 + captions…'
              : 'Create MP4 + captions'}
          </button>
          <button
            type="button"
            className="ml-auto text-xs px-2 py-1 border rounded"
            onClick={() => refreshExports(r.id)}
          >
            Refresh exports
          </button>
        </div>

        {exportsList.length === 0 ? (
          <div className="text-sm text-gray-400">
            No exports yet. Use the buttons above to create one.
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {exportsList.map((exp) => (
              <div
                key={exp.id}
                className="flex justify-between items-center border border-gray-700 rounded px-3 py-2"
              >
                <div>
                  <div>
                    <b>{exp.type}</b> · {exp.state}
                  </div>
                  <div className="text-gray-400">
                    Created {new Date(exp.createdAt).toLocaleString()}
                    {exp.lastError && (
                      <span className="text-red-400"> · {exp.lastError}</span>
                    )}
                  </div>
                </div>
                {exp.state === 'succeeded' && (
                  <button
                    className="px-3 py-1 rounded border border-gray-600 hover:bg-gray-800"
                    onClick={() => handleDownloadExport(exp)}
                    title="Download exported file"
                  >
                    Download
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}