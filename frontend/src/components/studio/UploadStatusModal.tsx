'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ConsumerRecordingState } from '@/lib/api';
import { toConsumerStateLabel } from '@/lib/recording-journey';

type UploadParticipant = {
  participantId: string;
  role: 'host' | 'guest' | string;
  displayName?: string;
  state: ConsumerRecordingState;
  progressPct: number;
  blockedReason?: string;
};

type RecordingUploadSummary = {
  participantsTotal: number;
  participantsComplete: number;
  participantsUploading: number;
  actionRequiredParticipants: number;
};

type UploadStatusModalProps = {
  open: boolean;
  participants: UploadParticipant[];
  canOpenProject: boolean;
  onClose: () => void;
  onGoToProject: () => void;
  state: ConsumerRecordingState;
  summary?: RecordingUploadSummary;
  keepPageOpenHint?: boolean;
  canDismiss?: boolean;
  variant?: 'modal' | 'floating';
  floatingLayout?: {
    leftInset?: number;
    rightInset?: number;
    bottomInset?: number;
  };
};

export default function UploadStatusModal(props: UploadStatusModalProps) {
  const isOpen = props.open;
  const canDismiss = props.canDismiss ?? true;
  const variant = props.variant ?? 'modal';
  const participantRows = props.participants;
  const primaryParticipant = participantRows[0];
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const title =
    props.state === 'recording'
      ? 'Recording in progress'
      : props.state === 'uploading'
        ? 'Uploading recording'
        : props.state === 'processing'
          ? 'Upload complete'
          : props.state === 'action required'
            ? 'Action required'
            : 'Upload complete';

  const description =
    props.state === 'recording'
      ? 'Recording is still active.'
      : props.state === 'uploading'
        ? 'Participant uploads are still running. Keep this tab open until everyone is finished.'
        : props.state === 'processing'
          ? 'Uploads are complete. Open the project to keep following processing.'
          : props.state === 'action required'
            ? 'One or more participant uploads need attention before this recording is complete.'
            : 'Participant uploads are complete. Open the project when you are ready.';

  const buttonLabel =
    props.canOpenProject
      ? 'Go to project'
      : props.state === 'action required'
        ? 'Resolve upload issue'
        : 'Waiting for uploads...';

  useEffect(() => {
    if (variant !== 'floating') return;
    setIsDetailsOpen(false);
  }, [props.open, props.state, variant]);

  const showFloatingDetails = isDetailsOpen;

  const handleCloseDetails = () => {
    if (variant === 'floating') {
      setIsDetailsOpen(false);
      return;
    }
    props.onClose();
  };

  const detailsCard = (
    <div
      className={`w-full rounded-3xl border border-[#2f3648] bg-[#121620]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md ${
        variant === 'floating' ? 'max-w-md' : 'max-w-lg'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-2xl font-semibold text-slate-100">{title}</h3>
        {canDismiss && (
          <button
            type="button"
            onClick={handleCloseDetails}
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
            Participants:{' '}
            <span className="text-slate-200">
              {props.summary.participantsComplete}/{props.summary.participantsTotal}
            </span>
          </p>
          <p className="text-xs text-slate-400">
            Uploading: <span className="text-slate-200">{props.summary.participantsUploading}</span>
          </p>
          <p className="text-xs text-slate-400">
            Action required:{' '}
            <span className="text-slate-200">{props.summary.actionRequiredParticipants}</span>
          </p>
        </div>
      )}
      <div className="mt-4 max-h-48 space-y-2 overflow-y-auto pr-1">
        {participantRows.map((participant) => (
          <div key={participant.participantId} className="rounded-xl border border-slate-800 bg-[#1b202a] p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-100">
                {participant.displayName || participant.participantId.slice(0, 8)}
              </p>
              <span className="text-xs text-slate-400">
                {toConsumerStateLabel(participant.state)}
              </span>
            </div>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{participant.role}</p>
            <div className="mt-2 h-1.5 rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-violet-400"
                style={{ width: `${Math.max(participant.progressPct, 4)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>{participant.progressPct}%</span>
              {participant.blockedReason && <span>{participant.blockedReason}</span>}
            </div>
          </div>
        ))}
        {participantRows.length === 0 && (
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
  );

  const primaryInitials = useMemo(() => {
    const label = primaryParticipant?.displayName?.trim() || 'You';
    return label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }, [primaryParticipant?.displayName]);

  if (!isOpen) {
    return null;
  }

  if (variant === 'floating') {
    const floatingFrameStyle = {
      left: `${props.floatingLayout?.leftInset ?? 120}px`,
      right: `${props.floatingLayout?.rightInset ?? 120}px`,
      bottom: `${props.floatingLayout?.bottomInset ?? 102}px`,
    };

    return (
      <>
        {showFloatingDetails && (
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsDetailsOpen(false)}
          />
        )}
      <div className="fixed z-40 pointer-events-none" style={floatingFrameStyle}>
        <div className="pointer-events-auto relative w-full">
          {showFloatingDetails && (
            <div
              className="absolute left-1/2 top-0 z-20 w-full max-w-md -translate-x-1/2 -translate-y-[calc(100%+34px)]"
            >
              {detailsCard}
            </div>
          )}

          <div className="relative h-[62px] rounded-2xl border border-[#2f3648] bg-[#161b25]/95 px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">

            <button
              type="button"
              onClick={() => setIsDetailsOpen((prev) => !prev)}
              className="absolute left-1/2 top-1/2 flex h-11 min-w-[88px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-[#45506d] bg-[#20293a] px-2 hover:border-[#64749b]"
            >
              <div className="relative h-8 w-12 overflow-hidden rounded-md border border-[#5b6380] bg-gradient-to-br from-[#2a3347] to-[#111726]">
                <span className="absolute left-1.5 top-1 text-[9px] font-semibold text-slate-200">{primaryInitials || 'U'}</span>
              </div>
            </button>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 px-4">
      {detailsCard}
    </div>
  );
}
