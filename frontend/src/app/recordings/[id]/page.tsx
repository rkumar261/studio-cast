'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  API_BASE,
  ExportsAPI,
  ParticipantsAPI,
  RecordingsAPI,
  TracksAPI,
  type GetParticipantsResponse,
  type GetProjectAssetsGraphResponse,
  type GetRecordingResponse,
  type ProjectAssetActionDto,
  type ProjectAssetState,
  type RecordingProgressResponse,
} from '@/lib/api';
import ParticipantsList from '@/components/ParticipantsList';
import AddParticipantForm from '@/components/AddParticipantForm';
import UploadInitiateCard from '@/components/UploadInitiateCard';
import TranscriptPanel from '@/components/recordings/TranscriptPanel';
import { triggerDownloadFromUrl } from '@/lib/download';

type ParticipantItem = GetParticipantsResponse['participants'][number];

function toStateLabel(state: ProjectAssetState) {
  if (state === 'ready') return 'Ready';
  if (state === 'processing') return 'Processing';
  if (state === 'failed') return 'Failed';
  if (state === 'pending') return 'Pending';
  return 'Missing';
}

function stateBadgeClass(state: ProjectAssetState) {
  if (state === 'ready') return 'border-emerald-600/50 bg-emerald-500/10 text-emerald-200';
  if (state === 'processing') return 'border-cyan-600/50 bg-cyan-500/10 text-cyan-200';
  if (state === 'failed') return 'border-red-600/50 bg-red-500/10 text-red-200';
  if (state === 'pending') return 'border-amber-600/50 bg-amber-500/10 text-amber-200';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== 'number' || durationMs <= 0) return null;
  const totalSec = Math.floor(durationMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function formatBlockedReason(reason?: string) {
  if (!reason) return null;
  return reason
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function RecordingDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<GetRecordingResponse | null>(null);
  const [participants, setParticipants] = useState<GetParticipantsResponse['participants']>([]);
  const [progress, setProgress] = useState<RecordingProgressResponse | null>(null);
  const [projectAssets, setProjectAssets] = useState<GetProjectAssetsGraphResponse | null>(null);
  const [projectAssetsError, setProjectAssetsError] = useState<string | null>(null);
  const [assetActionBusyId, setAssetActionBusyId] = useState<string | null>(null);
  const [assetActionError, setAssetActionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const combinedPreviewRef = useRef<HTMLVideoElement | null>(null);

  function refreshParticipants(recId: string) {
    ParticipantsAPI.list(recId)
      .then((res) => setParticipants(res.participants ?? []))
      .catch(() => setParticipants([]));
  }

  function refreshProgress(recId: string) {
    RecordingsAPI.getProgress(recId)
      .then(setProgress)
      .catch(() => setProgress(null));
  }

  const refreshProjectAssets = useCallback(async (recId: string) => {
    try {
      const graph = await RecordingsAPI.getProjectAssets(recId);
      setProjectAssets(graph);
      setProjectAssetsError(null);
    } catch (err) {
      setProjectAssets(null);
      setProjectAssetsError((err as Error).message || 'Failed to load project assets.');
    }
  }, []);

  const loadAll = useCallback(
    async (recId: string) => {
      const [rec, parts] = await Promise.all([
        RecordingsAPI.getById(recId),
        ParticipantsAPI.list(recId).catch(() => ({ participants: [] })),
      ]);
      setData(rec);
      setParticipants(parts.participants ?? []);

      refreshProgress(recId);
      await refreshProjectAssets(recId);
    },
    [refreshProjectAssets]
  );

  useEffect(() => {
    if (typeof id === 'string') {
      loadAll(id);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [id, loadAll]);

  useEffect(() => {
    if (typeof id !== 'string') return;

    const timer = setInterval(() => {
      refreshProgress(id);
      refreshProjectAssets(id);
    }, 5000);

    return () => clearInterval(timer);
  }, [id, refreshProjectAssets]);

  const participantById = useMemo(() => {
    const map = new Map<string, ParticipantItem>();
    for (const p of participants) map.set(p.id, p);
    return map;
  }, [participants]);

  if (!data) return <p>Loading…</p>;

  const r = data.recording;
  const exportSummary = projectAssets?.exports;
  const allRequiredExportsSucceeded = !!exportSummary && exportSummary.requiredTotal > 0 && exportSummary.ready === exportSummary.requiredTotal;
  const anyRequiredExportFailed = !!exportSummary && exportSummary.failed > 0;

  const flowStage =
    r.status === 'error' || anyRequiredExportFailed
      ? 'error'
      : allRequiredExportsSucceeded || r.status === 'ready'
      ? 'exports_ready'
      : progress?.phase === 'processing' || r.status === 'processing'
      ? 'processing'
      : progress?.phase === 'uploading' || r.status === 'uploading'
      ? 'uploading'
      : progress?.phase === 'recording'
      ? 'recording'
      : 'uploading';

  async function handleTrackDownload(trackId: string) {
    const { url } = await TracksAPI.finalUrl(trackId);
    triggerDownloadFromUrl(url);
  }

  async function handleAssetAction(action: ProjectAssetActionDto) {
    setAssetActionBusyId(action.id);
    setAssetActionError(null);

    try {
      if (action.kind === 'open_url') {
        window.open(action.href, '_blank', 'noopener,noreferrer');
        return;
      }

      if (action.kind === 'api' && action.href.startsWith('/v1/exports/')) {
        const exportId = action.href.split('/').pop();
        if (!exportId) return;
        const result = await ExportsAPI.getById(exportId);
        if (result.downloadUrl) {
          triggerDownloadFromUrl(result.downloadUrl);
        } else {
          triggerDownloadFromUrl(`${API_BASE}${action.href}`);
        }
        return;
      }

      if (action.kind === 'api') {
        triggerDownloadFromUrl(`${API_BASE}${action.href}`);
      }
    } catch (err) {
      setAssetActionError((err as Error).message || 'Action failed.');
    } finally {
      setAssetActionBusyId(null);
    }
  }

  function startTrackPolling(recId: string) {
    if (pollRef.current) return;

    pollRef.current = setInterval(async () => {
      try {
        const rec = await RecordingsAPI.getById(recId);
        setData(rec);
        const anyPending = rec.tracks.some((t) => t.state === 'uploaded');

        if (!anyPending && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // ignore transient polling errors
      }
    }, 5000);
  }

  function seekPrimaryMediaTo(ms: number) {
    const video = combinedPreviewRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, ms / 1000);
    void video.play().catch(() => {});
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{r.title || '(untitled)'}</h1>
      <div className="text-sm text-gray-300">
        Status: <b>{r.status}</b> · Created: {new Date(r.createdAt).toLocaleString()}
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Recording flow</h2>
        <div className="grid gap-2 text-sm md:grid-cols-5">
          {[
            { key: 'recording', label: 'Recording' },
            { key: 'uploading', label: 'Uploading' },
            { key: 'processing', label: 'Processing' },
            { key: 'exports_ready', label: 'Exports ready' },
            { key: 'error', label: 'Error' },
          ].map((step) => {
            const active = flowStage === step.key;
            const done =
              flowStage === 'exports_ready'
                ? ['recording', 'uploading', 'processing', 'exports_ready'].includes(step.key)
                : flowStage === 'processing'
                ? ['recording', 'uploading', 'processing'].includes(step.key)
                : flowStage === 'uploading'
                ? ['recording', 'uploading'].includes(step.key)
                : flowStage === 'recording'
                ? ['recording'].includes(step.key)
                : step.key === 'error';

            return (
              <div
                key={step.key}
                className={`rounded border px-3 py-2 ${
                  active
                    ? 'border-indigo-400 bg-indigo-950/50'
                    : done
                    ? 'border-emerald-700 bg-emerald-950/30'
                    : 'border-gray-700 bg-gray-900/40'
                }`}
              >
                <div className="font-medium">{step.label}</div>
                <div className="text-xs text-gray-400">{active ? 'active' : done ? 'done' : 'pending'}</div>
              </div>
            );
          })}
        </div>

        {progress && (
          <div className="grid gap-2 text-xs text-gray-300 md:grid-cols-3">
            <div className="rounded border border-gray-700 px-3 py-2">
              Participants: {progress.summary.participantsCompleted}/{progress.summary.participantsTotal}
            </div>
            <div className="rounded border border-gray-700 px-3 py-2">
              Chunks uploaded: {progress.summary.chunksUploaded}/{progress.summary.chunksTotal} (pending {progress.summary.chunksPending})
            </div>
            <div className="rounded border border-gray-700 px-3 py-2">
              Required exports: {projectAssets?.exports.ready ?? 0}/{projectAssets?.exports.requiredTotal ?? 0} (failed {projectAssets?.exports.failed ?? 0})
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Project assets</h2>
          <button
            type="button"
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
            onClick={() => refreshProjectAssets(r.id)}
          >
            Refresh assets
          </button>
        </div>

        {projectAssetsError && (
          <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {projectAssetsError}
          </p>
        )}

        {assetActionError && (
          <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {assetActionError}
          </p>
        )}

        {!projectAssets ? (
          <div className="rounded border border-slate-700 px-3 py-4 text-sm text-slate-400">
            Project assets are loading.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">Primary output</p>
              <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-slate-100">{projectAssets.combinedAsset.label}</p>
                    <p className="text-xs text-slate-400">
                      {formatDuration(projectAssets.combinedAsset.durationMs) ?? 'Duration pending'}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-1 text-[11px] font-medium ${stateBadgeClass(projectAssets.combinedAsset.state)}`}
                  >
                    {toStateLabel(projectAssets.combinedAsset.state)}
                  </span>
                </div>

                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">
                  {projectAssets.combinedAsset.state === 'ready' && projectAssets.combinedAsset.previewUrl
                    ? 'Preview is available.'
                    : 'Preview will appear after processing is ready.'}
                </div>

                {projectAssets.combinedAsset.blockedReason && projectAssets.combinedAsset.state !== 'ready' && (
                  <p className="mt-3 text-xs text-slate-400">
                    {formatBlockedReason(projectAssets.combinedAsset.blockedReason)}
                  </p>
                )}

                {projectAssets.combinedAsset.state === 'ready' && projectAssets.combinedAsset.previewUrl && (
                  <video
                    ref={combinedPreviewRef}
                    className="mt-3 w-full rounded-lg border border-slate-800 bg-black"
                    src={projectAssets.combinedAsset.previewUrl}
                    controls
                    preload="none"
                  />
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(projectAssets.combinedAsset.state === 'ready' ? projectAssets.combinedAsset.actions : []).map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        disabled={assetActionBusyId === action.id}
                        onClick={() => handleAssetAction(action)}
                        className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-100 hover:border-cyan-400 disabled:opacity-60"
                      >
                        {assetActionBusyId === action.id ? 'Working...' : action.label}
                      </button>
                    ))}
                </div>
              </article>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">Participant outputs</p>
              {projectAssets.participantAssets.length === 0 ? (
                <div className="rounded border border-dashed border-slate-700 px-3 py-4 text-sm text-slate-400">
                  No participant assets yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {projectAssets.participantAssets.map((asset) => (
                    <article key={asset.id} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-100">
                            {asset.participant?.name?.trim() || asset.label}
                          </p>
                          <p className="text-xs text-slate-400">
                            {(asset.participant?.role || 'participant').toUpperCase()} · {formatDuration(asset.durationMs) ?? 'Duration pending'}
                          </p>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[11px] ${stateBadgeClass(asset.state)}`}>
                          {toStateLabel(asset.state)}
                        </span>
                      </div>

                      {asset.state === 'ready' && asset.previewUrl ? (
                        <video
                          className="mt-3 w-full rounded-lg border border-slate-800 bg-black"
                          src={asset.previewUrl}
                          controls
                          preload="none"
                        />
                      ) : (
                        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400">
                          Preview unavailable until this participant asset is ready.
                        </div>
                      )}

                      {asset.blockedReason && asset.state !== 'ready' && (
                        <p className="mt-3 text-xs text-slate-400">
                          {formatBlockedReason(asset.blockedReason)}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {(asset.state === 'ready' ? asset.actions : []).map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              disabled={assetActionBusyId === action.id}
                              onClick={() => handleAssetAction(action)}
                              className="rounded border border-slate-600 px-2.5 py-1 text-xs text-slate-100 hover:border-cyan-400 disabled:opacity-60"
                            >
                              {assetActionBusyId === action.id ? 'Working...' : action.label}
                            </button>
                          ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">Transcript, captions, and exports</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[projectAssets.transcript, projectAssets.captions].map((asset) => (
                  <article key={asset.label} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-100">{asset.label}</p>
                      <span className={`rounded-full border px-2 py-1 text-[11px] ${stateBadgeClass(asset.state)}`}>
                        {toStateLabel(asset.state)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      {asset.state === 'ready' ? 'Ready for preview or download.' : 'Still processing or not generated yet.'}
                    </div>
                    {asset.blockedReason && asset.state !== 'ready' && (
                      <p className="mt-3 text-xs text-slate-400">
                        {formatBlockedReason(asset.blockedReason)}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(asset.state === 'ready' ? asset.actions : []).map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            disabled={assetActionBusyId === action.id}
                            onClick={() => handleAssetAction(action)}
                            className="rounded border border-slate-600 px-2.5 py-1 text-xs text-slate-100 hover:border-cyan-400 disabled:opacity-60"
                          >
                            {assetActionBusyId === action.id ? 'Working...' : action.label}
                          </button>
                        ))}
                    </div>
                  </article>
                ))}

                {projectAssets.exports.items.map((exp) => (
                  <article key={exp.type} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-100">{exp.label}</p>
                      <span className={`rounded-full border px-2 py-1 text-[11px] ${stateBadgeClass(exp.state)}`}>
                        {toStateLabel(exp.state)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      {exp.state === 'ready' ? 'Download is available.' : 'Download appears only when ready.'}
                    </div>
                    {exp.blockedReason && exp.state !== 'ready' && (
                      <p className="mt-3 text-xs text-slate-400">
                        {formatBlockedReason(exp.blockedReason)}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(exp.state === 'ready' ? exp.actions : []).map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            disabled={assetActionBusyId === action.id}
                            onClick={() => handleAssetAction(action)}
                            className="rounded border border-slate-600 px-2.5 py-1 text-xs text-slate-100 hover:border-cyan-400 disabled:opacity-60"
                          >
                            {assetActionBusyId === action.id ? 'Working...' : action.label}
                          </button>
                        ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <TranscriptPanel
        recordingId={r.id}
        onSeekToMs={seekPrimaryMediaTo}
        onSavedRevision={() => refreshProjectAssets(r.id)}
      />

      <section className="space-y-3">
        <h2 className="font-semibold">Session mode</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Link
            href={`/studio/${r.id}?mode=meet`}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 hover:border-slate-500"
          >
            <p className="text-sm font-semibold text-slate-100">Meet</p>
            <p className="mt-1 text-xs text-slate-400">
              Fast call flow for collaboration and interviews.
            </p>
          </Link>

          <Link
            href={`/studio/${r.id}?mode=studio`}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 hover:border-slate-500"
          >
            <p className="text-sm font-semibold text-slate-100">Recording Studio</p>
            <p className="mt-1 text-xs text-slate-400">
              Creator-focused layout for high-quality recording sessions.
            </p>
          </Link>
        </div>
      </section>

      <section id="participants" className="space-y-3">
        <h2 className="font-semibold">Participants</h2>
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="rounded border bg-white p-4 text-sm text-gray-900">
            <AddParticipantForm recordingId={r.id} onCreated={() => refreshParticipants(r.id)} />
          </div>
          <div className="rounded border bg-white p-4 text-sm text-gray-900">
            <ParticipantsList recordingId={r.id} />
          </div>
        </div>
      </section>

      <section id="uploads" className="space-y-3">
        <h2 className="font-semibold">Uploads</h2>
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="rounded border bg-white p-4 text-sm text-gray-900">
            <UploadInitiateCard
              recordingId={r.id}
              participants={participants}
              onUploaded={() => {
                loadAll(r.id);
                startTrackPolling(r.id);
              }}
            />
          </div>

          <div className="rounded border bg-white p-4 text-sm text-gray-900">
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 font-semibold">
                Tracks
                <button
                  type="button"
                  className="ml-auto rounded border px-2 py-1 text-xs"
                  onClick={() => loadAll(r.id)}
                >
                  Refresh
                </button>
              </h2>

              <div className="rounded border bg-white p-4 text-sm text-gray-900">
                {data.tracks.length === 0 ? (
                  'No tracks yet (initiate upload from client when ready).'
                ) : (
                  <div className="divide-y">
                    {data.tracks.map((t, idx) => {
                      const canDownload = t.state === 'processed';
                      const p = participantById.get(t.participantId);
                      const label = p
                        ? `${p.role === 'host' ? 'Host' : 'Guest'} · ${p.displayName || p.email || p.id}`
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
                                handleTrackDownload(t.id);
                              }}
                              className="ml-auto rounded bg-indigo-600 px-3 py-1.5 text-white"
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
