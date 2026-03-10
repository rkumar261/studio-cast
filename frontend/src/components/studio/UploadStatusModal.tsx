'use client';

type UploadParticipant = {
  participantId: string;
  displayName?: string;
  trackCount: number;
  uploadedCount: number;
  pendingCount: number;
};

type UploadLifecyclePhase = 'stopping' | 'uploading' | 'upload_complete' | 'processing_handoff';

type RecordingUploadSummary = {
  participantsTotal: number;
  participantsCompleted: number;
  tracksTotal: number;
  tracksUploaded: number;
  chunksTotal: number;
  chunksUploaded: number;
};

type UploadStatusModalProps = {
  open: boolean;
  participants: UploadParticipant[];
  canOpenProject: boolean;
  onClose: () => void;
  onGoToProject: () => void;
  phase?: UploadLifecyclePhase;
  summary?: RecordingUploadSummary;
  keepPageOpenHint?: boolean;
  canDismiss?: boolean;
};

export default function UploadStatusModal(props: UploadStatusModalProps) {
  if (!props.open) return null;

  const phase = props.phase ?? (props.canOpenProject ? 'upload_complete' : 'uploading');
  const canDismiss = props.canDismiss ?? true;

  const title =
    phase === 'stopping'
      ? 'Stopping recording'
      : phase === 'uploading'
        ? 'Uploading recording'
        : phase === 'processing_handoff'
          ? 'Uploads complete'
          : 'Uploads complete';

  const description =
    phase === 'stopping'
      ? 'Finalizing tracks and preparing uploads.'
      : phase === 'uploading'
        ? 'Uploading participant media. Keep this tab open until upload completes.'
        : phase === 'processing_handoff'
          ? 'Participant uploads are complete. Project assets are processing. Open the project to monitor readiness.'
          : 'Participant uploads are complete. Open the project to continue while processing updates appear.';

  const buttonLabel =
    props.canOpenProject
      ? 'Go to project'
      : phase === 'stopping'
        ? 'Stopping...'
        : 'Waiting for uploads...';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-[#121620] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-slate-100">{title}</h3>
          {canDismiss && (
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-full border border-slate-600 px-3 py-1 text-sm text-slate-300"
            >
              ×
            </button>
          )}
        </div>
        <p className="text-sm text-slate-300">{description}</p>
        {props.keepPageOpenHint && (
          <p className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Keep this page open. Closing it can interrupt upload completion.
          </p>
        )}
        {props.summary && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-[#1b202a] p-3">
            <p className="text-xs text-slate-400">
              Participants: <span className="text-slate-200">{props.summary.participantsCompleted}/{props.summary.participantsTotal}</span>
            </p>
            <p className="text-xs text-slate-400">
              Tracks: <span className="text-slate-200">{props.summary.tracksUploaded}/{props.summary.tracksTotal}</span>
            </p>
            <p className="text-xs text-slate-400">
              Chunks: <span className="text-slate-200">{props.summary.chunksUploaded}/{props.summary.chunksTotal}</span>
            </p>
          </div>
        )}
        <div className="mt-4 space-y-2">
          {props.participants.map((participant) => {
            const pct =
              participant.trackCount === 0
                ? 0
                : Math.round((participant.uploadedCount / participant.trackCount) * 100);
            return (
              <div key={participant.participantId} className="rounded-xl border border-slate-800 bg-[#1b202a] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-100">
                    {participant.displayName || participant.participantId.slice(0, 8)}
                  </p>
                  <span className="text-xs text-slate-400">
                    {participant.pendingCount > 0 ? `${pct}%` : 'Uploaded'}
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.max(pct, 4)}%` }} />
                </div>
              </div>
            );
          })}
          {props.participants.length === 0 && (
            <p className="text-xs text-slate-400">Waiting for upload progress...</p>
          )}
        </div>
        <button
          type="button"
          disabled={!props.canOpenProject}
          onClick={props.onGoToProject}
          className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
