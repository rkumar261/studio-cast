'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  API_BASE,
  ExportsAPI,
  RecordingsAPI,
  type GetProjectAssetsGraphResponse,
  type GetRecordingResponse,
  type ProjectAssetActionDto,
  type ProjectAssetState,
  type RecordingProgressResponse,
} from '@/lib/api';
import TranscriptPanel from '@/components/recordings/TranscriptPanel';
import { triggerDownloadFromUrl } from '@/lib/download';
import {
  consumerStateBadgeClass,
  toConsumerStateLabel,
} from '@/lib/recording-journey';

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== 'number' || durationMs <= 0) return null;
  const totalSec = Math.floor(durationMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function formatBlockedReason(reason?: string) {
  return reason?.trim() || null;
}

function stateSummaryCopy(state: ProjectAssetState) {
  if (state === 'ready') return 'Your recording outputs are ready.';
  if (state === 'processing') return 'Processing is still running on your recording.';
  if (state === 'uploading') return 'Uploads are still being finalized before processing can continue.';
  if (state === 'action required') return 'This recording needs attention before it is fully ready.';
  return 'Recording is still in progress.';
}

export default function RecordingDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<GetRecordingResponse | null>(null);
  const [progress, setProgress] = useState<RecordingProgressResponse | null>(null);
  const [projectAssets, setProjectAssets] = useState<GetProjectAssetsGraphResponse | null>(null);
  const [projectAssetsError, setProjectAssetsError] = useState<string | null>(null);
  const [assetActionBusyId, setAssetActionBusyId] = useState<string | null>(null);
  const [assetActionError, setAssetActionError] = useState<string | null>(null);
  const combinedPreviewRef = useRef<HTMLVideoElement | null>(null);

  const refreshProgress = useCallback((recId: string) => {
    RecordingsAPI.getProgress(recId)
      .then(setProgress)
      .catch(() => setProgress(null));
  }, []);

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
      const rec = await RecordingsAPI.getById(recId);
      setData(rec);
      refreshProgress(recId);
      await refreshProjectAssets(recId);
    },
    [refreshProgress, refreshProjectAssets]
  );

  useEffect(() => {
    if (typeof id !== 'string') return;
    void loadAll(id);
  }, [id, loadAll]);

  useEffect(() => {
    if (typeof id !== 'string') return;
    // Poll faster while processing so the UI reflects pipeline completion sooner.
    const pollMs = progress?.projectState === 'processing' ? 1000 : 5000;
    const timer = setInterval(() => {
      refreshProgress(id);
      void refreshProjectAssets(id);
    }, pollMs);
    return () => clearInterval(timer);
  }, [id, refreshProgress, refreshProjectAssets, progress?.projectState]);

  if (!data) return <p>Loading…</p>;

  const recording = data.recording;
  const projectState = projectAssets?.project.state ?? progress?.projectState ?? 'uploading';
  const processingSummary = projectAssets?.processingSummary;

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

  function seekPrimaryMediaTo(ms: number) {
    const video = combinedPreviewRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, ms / 1000);
    void video.play().catch(() => {});
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/recordings" className="text-xs text-slate-400 hover:text-slate-100">
              ← Back to recordings
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-slate-100">{recording.title || 'Untitled project'}</h1>
            <p className="mt-2 text-sm text-slate-400">
              Created {new Date(recording.createdAt).toLocaleString()}
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${consumerStateBadgeClass(projectState)}`}>
            {toConsumerStateLabel(projectState)}
          </span>
        </div>

        <p className="mt-4 max-w-2xl text-sm text-slate-300">{stateSummaryCopy(projectState)}</p>

        {processingSummary && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-1 text-[11px] ${processingSummary.minimumReady ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-300'}`}>
                {processingSummary.minimumReady ? 'Minimum ready' : 'Minimum ready pending'}
              </span>
              <span className={`rounded-full border px-2 py-1 text-[11px] ${processingSummary.fullyProcessed ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 text-slate-300'}`}>
                {processingSummary.fullyProcessed ? 'Fully processed' : 'Processing continues'}
              </span>
            </div>
            <p className="mt-3">
              {processingSummary.minimumReady
                ? 'The project is usable now. Remaining derivatives can finish in the background.'
                : 'The project is still assembling its first playable assets.'}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Combined ready: {processingSummary.readyPrimaryAsset ? 'yes' : 'no'} · Participant assets ready: {processingSummary.readyParticipantCount}/{processingSummary.participantCount}
            </p>
            {(processingSummary.pendingWork.length > 0 || processingSummary.failedWork.length > 0) && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Pending work</p>
                  {processingSummary.pendingWork.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-300">
                      {processingSummary.pendingWork.map((item, idx) => (
                        <li key={`pending-${idx}`}>{item.label}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">No pending work.</p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Failed work</p>
                  {processingSummary.failedWork.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-300">
                      {processingSummary.failedWork.map((item, idx) => (
                        <li key={`failed-${idx}`}>{item.label}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">No failed work.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {progress && (
          <div className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3">
              Participants complete: {progress.summary.participantsComplete}/{progress.summary.participantsTotal}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3">
              Uploading now: {progress.summary.participantsUploading}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3">
              Action required: {progress.summary.actionRequiredParticipants}
            </div>
          </div>
        )}
      </header>

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Project assets</h2>
          <button
            type="button"
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
            onClick={() => refreshProjectAssets(recording.id)}
          >
            Refresh
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
                    className={`rounded-full border px-2 py-1 text-[11px] font-medium ${consumerStateBadgeClass(projectAssets.combinedAsset.state)}`}
                  >
                    {toConsumerStateLabel(projectAssets.combinedAsset.state)}
                  </span>
                </div>

                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">
                  {projectAssets.combinedAsset.state === 'ready' && projectAssets.combinedAsset.previewUrl
                    ? 'Preview is available.'
                    : projectAssets.combinedAsset.rawPreviewUrl
                      ? 'Preview (processing…) — video only, audio coming soon.'
                      : stateSummaryCopy(projectAssets.combinedAsset.state)}
                </div>

                {projectAssets.combinedAsset.blockedReason && projectAssets.combinedAsset.state !== 'ready' && !projectAssets.combinedAsset.rawPreviewUrl && (
                  <p className="mt-3 text-xs text-slate-400">
                    {formatBlockedReason(projectAssets.combinedAsset.blockedReason)}
                  </p>
                )}

                {(projectAssets.combinedAsset.state === 'ready' && projectAssets.combinedAsset.previewUrl) && (
                  <video
                    ref={combinedPreviewRef}
                    className="mt-3 w-full rounded-lg border border-slate-800 bg-black"
                    src={projectAssets.combinedAsset.previewUrl}
                    controls
                    preload="none"
                  />
                )}

                {projectAssets.combinedAsset.state !== 'ready' && projectAssets.combinedAsset.rawPreviewUrl && (
                  <video
                    className="mt-3 w-full rounded-lg border border-amber-800/40 bg-black opacity-90"
                    src={projectAssets.combinedAsset.rawPreviewUrl}
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
                  Participant outputs will appear here after processing starts.
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
                        <span className={`rounded-full border px-2 py-1 text-[11px] ${consumerStateBadgeClass(asset.state)}`}>
                          {toConsumerStateLabel(asset.state)}
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
                          {stateSummaryCopy(asset.state)}
                        </div>
                      )}

                      {asset.blockedReason && asset.state !== 'ready' && (
                        <p className="mt-3 text-xs text-slate-400">
                          {formatBlockedReason(asset.blockedReason)}
                        </p>
                      )}

                      {asset.qualityWarnings && (asset.qualityWarnings.audioWarning || asset.qualityWarnings.videoWarning || asset.qualityWarnings.durationWarning) && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {asset.qualityWarnings.audioWarning === 'no_audio_stream' && (
                            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400">
                              ⚠ No audio detected
                            </span>
                          )}
                          {asset.qualityWarnings.videoWarning === 'black_video' && (
                            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400">
                              ⚠ Video appears black
                            </span>
                          )}
                          {asset.qualityWarnings.videoWarning === 'insufficient_frames' && (
                            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400">
                              ⚠ Very short video
                            </span>
                          )}
                          {asset.qualityWarnings.durationWarning && (
                            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400">
                              ⚠ Duration mismatch
                            </span>
                          )}
                        </div>
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
                      <span className={`rounded-full border px-2 py-1 text-[11px] ${consumerStateBadgeClass(asset.state)}`}>
                        {toConsumerStateLabel(asset.state)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      {asset.state === 'ready' ? 'Ready for preview or download.' : stateSummaryCopy(asset.state)}
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
                      <span className={`rounded-full border px-2 py-1 text-[11px] ${consumerStateBadgeClass(exp.state)}`}>
                        {toConsumerStateLabel(exp.state)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      {exp.state === 'ready' ? 'Download is available.' : stateSummaryCopy(exp.state)}
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
        recordingId={recording.id}
        onSeekToMs={seekPrimaryMediaTo}
        onSavedRevision={() => refreshProjectAssets(recording.id)}
      />
    </div>
  );
}
