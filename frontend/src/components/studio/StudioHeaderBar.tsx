'use client';

import Link from 'next/link';

type StudioHeaderBarProps = {
  displayName: string;
  recordingTitle: string;
  isRecording: boolean;
  recordingClock: string;
  showUploadChip: boolean;
  uploadChipLabel: string | null;
  canUseBroadcastControls: boolean;
  canSendInvites: boolean;
  onOpenInviteModal: () => void;
};

export function StudioHeaderBar(props: StudioHeaderBarProps) {
  return (
    <header className="studio-panel-surface flex items-center justify-between rounded-2xl px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" className="studio-control-surface rounded-full p-1 text-slate-300 hover:text-white">
          ←
        </Link>
        <p className="text-xl font-semibold tracking-[0.2em] text-slate-100">STUDIO CAST</p>
        <span className="text-slate-600">|</span>
        <p className="truncate text-base text-slate-400">{props.displayName || 'Host'} KUMAR&apos;s Studio</p>
        <p className="truncate text-xl font-semibold text-slate-100">{props.recordingTitle}</p>
      </div>

      <div className="flex items-center gap-2">
        {props.isRecording && (
          <span className="rounded-full bg-rose-500/20 px-3 py-1 text-sm font-semibold text-rose-200">
            REC {props.recordingClock}
          </span>
        )}
        {props.showUploadChip && props.uploadChipLabel && (
          <span className="rounded-2xl bg-violet-500/35 px-4 py-2 text-sm font-semibold text-violet-100">
            {props.uploadChipLabel}
          </span>
        )}
        {props.canUseBroadcastControls && (
          <button
            type="button"
            className="studio-control-surface flex items-center rounded-2xl px-4 py-2 text-sm font-medium"
          >
            <span className="mr-1.5 text-lg">+</span>
            Live stream
          </button>
        )}
        <button
          type="button"
          className="studio-control-surface flex h-10 w-10 items-center justify-center rounded-2xl text-sm"
        >
          ?
        </button>
        <button
          type="button"
          className="studio-control-surface flex h-10 w-10 items-center justify-center rounded-2xl text-sm"
        >
          ⚙
        </button>
        {props.canSendInvites && (
          <button
            type="button"
            onClick={props.onOpenInviteModal}
            className="studio-control-surface rounded-2xl px-4 py-2 text-sm font-medium"
          >
            Invite
          </button>
        )}
      </div>
    </header>
  );
}
