'use client';

import Link from 'next/link';

type MeetHeaderBarProps = {
  recordingId: string;
  statusLabel: string;
  participantCount: number;
  showViewMenu: boolean;
  fitLabel: string;
  showPeopleLabel: string;
  hasRemoteStage: boolean;
  selfPreviewLabel: string;
  showSelfPreviewSizeAction: boolean;
  selfPreviewSizeLabel: string;
  onToggleViewMenu: () => void;
  onToggleFit: () => void;
  onToggleFullscreen: () => void | Promise<void>;
  onTogglePeoplePanel: () => void;
  onToggleSelfPreview: () => void;
  onToggleSelfPreviewSize: () => void;
};

export function MeetHeaderBar(props: MeetHeaderBarProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/90 bg-[#12151c]/80 px-4 py-3">
      <div className="flex items-center gap-3">
        <Link href="/" className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:text-white">
          Back
        </Link>
        <div>
          <p className="text-base font-semibold">Meet</p>
          <p className="font-mono text-[11px] text-slate-500">roomId: {props.recordingId}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-300">
          {props.statusLabel}
        </span>
        <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-300">
          Participants: {props.participantCount}
        </span>
        <div className="relative" data-meet-view-menu-root>
          <button
            type="button"
            onClick={props.onToggleViewMenu}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-300 hover:border-slate-500"
          >
            View ▾
          </button>

          {props.showViewMenu && (
            <div className="absolute right-0 top-10 z-40 w-52 rounded-xl border border-slate-700 bg-[#1b1e24] p-1 shadow-2xl">
              <button
                type="button"
                onClick={props.onToggleFit}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
              >
                {props.fitLabel}
              </button>
              <button
                type="button"
                onClick={() => void props.onToggleFullscreen()}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
              >
                Full screen
              </button>
              <button
                type="button"
                onClick={props.onTogglePeoplePanel}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
              >
                {props.showPeopleLabel}
              </button>
              {props.hasRemoteStage && (
                <button
                  type="button"
                  onClick={props.onToggleSelfPreview}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
                >
                  {props.selfPreviewLabel}
                </button>
              )}
              {props.hasRemoteStage && props.showSelfPreviewSizeAction && (
                <button
                  type="button"
                  onClick={props.onToggleSelfPreviewSize}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
                >
                  {props.selfPreviewSizeLabel}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
