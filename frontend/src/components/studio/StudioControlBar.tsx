'use client';

import { StudioControlIcon } from '@/components/studio/StudioIcons';

type StudioControlBarProps = {
  showRecordButton: boolean;
  canControlRecording: boolean;
  sessionBusy: boolean;
  isRecording: boolean;
  isMicOff: boolean;
  isCamOff: boolean;
  isScreenSharing: boolean;
  onToggleRecordingSession: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onLeave: () => void | Promise<void>;
};

export function StudioControlBar(props: StudioControlBarProps) {
  return (
    <footer className="mt-4 flex justify-center">
      <div className="studio-panel-muted flex flex-wrap items-start justify-center gap-3 rounded-2xl px-4 py-3">
        {props.showRecordButton && (
          <>
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={props.onToggleRecordingSession}
                disabled={!props.canControlRecording || props.sessionBusy}
                className={`rounded-xl px-5 py-2.5 text-base font-semibold text-white ${
                  props.isRecording ? 'bg-rose-500' : 'bg-rose-500/90'
                } disabled:opacity-60`}
              >
                {props.sessionBusy
                  ? props.isRecording
                    ? 'Stopping...'
                    : 'Starting...'
                  : props.isRecording
                    ? 'Stop'
                    : 'Record'}
              </button>
              <span className="text-[10px] text-slate-400">{props.isRecording ? 'Stop' : 'Start'}</span>
            </div>

            <div className="h-12 w-px bg-slate-700/70" />
          </>
        )}

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            className="studio-control-surface flex h-12 w-12 items-center justify-center rounded-xl text-slate-100"
          >
            <StudioControlIcon kind="mark" />
          </button>
          <span className="text-[10px] text-slate-400">Mark Clip</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={props.onToggleMic}
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              props.isMicOff
                ? 'border border-rose-500/40 bg-rose-500/20 text-rose-300'
                : 'studio-control-surface text-slate-100'
            }`}
          >
            <StudioControlIcon kind="mic" off={props.isMicOff} />
          </button>
          <span className="text-[10px] text-slate-400">Mic</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={props.onToggleCamera}
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              props.isCamOff
                ? 'border border-rose-500/40 bg-rose-500/20 text-rose-300'
                : 'studio-control-surface text-slate-100'
            }`}
          >
            <StudioControlIcon kind="cam" off={props.isCamOff} />
          </button>
          <span className="text-[10px] text-slate-400">Cam</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <button type="button" className="studio-control-surface flex h-12 w-12 items-center justify-center rounded-xl text-slate-100">
            <StudioControlIcon kind="speaker" />
          </button>
          <span className="text-[10px] text-slate-400">Speaker</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button type="button" className="studio-control-surface flex h-12 w-12 items-center justify-center rounded-xl text-slate-100">
            <StudioControlIcon kind="react" />
          </button>
          <span className="text-[10px] text-slate-400">React</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button type="button" className="studio-control-surface flex h-12 w-12 items-center justify-center rounded-xl text-slate-100">
            <StudioControlIcon kind="raise" />
          </button>
          <span className="text-[10px] text-slate-400">Raise</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button type="button" className="studio-control-surface flex h-12 w-12 items-center justify-center rounded-xl text-slate-100">
            <StudioControlIcon kind="layout" />
          </button>
          <span className="text-[10px] text-slate-400">Layout</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button type="button" className="studio-control-surface flex h-12 w-12 items-center justify-center rounded-xl text-slate-100">
            <StudioControlIcon kind="script" />
          </button>
          <span className="text-[10px] text-slate-400">Script</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={props.onToggleScreen}
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              props.isScreenSharing
                ? 'border border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                : 'studio-control-surface text-slate-100'
            }`}
          >
            <StudioControlIcon kind="share" />
          </button>
          <span className="text-[10px] text-slate-400">Share</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => void props.onLeave()}
            disabled={props.sessionBusy}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4b1f2a] text-rose-100 hover:bg-[#5f2735] disabled:opacity-60"
          >
            <StudioControlIcon kind="leave" />
          </button>
          <span className="text-[10px] text-slate-400">Leave</span>
        </div>
      </div>
    </footer>
  );
}
