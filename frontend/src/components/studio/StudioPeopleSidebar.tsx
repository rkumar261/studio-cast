'use client';

import { StudioSidebarIcon } from '@/components/studio/StudioIcons';

type StudioSidebarPerson = {
  id: string;
  label: string;
  role: string;
  percent: number;
  note: string;
  showProgressBar: boolean;
};

type StudioPeopleSidebarProps = {
  showPanel: boolean;
  showAddParticipantPanel: boolean;
  canManageParticipants: boolean;
  isRecording: boolean;
  stoppedUploadingPhase: boolean;
  people: StudioSidebarPerson[];
  onClosePanel: () => void;
  onTogglePanel: () => void;
  onToggleAddParticipantPanel: () => void;
  onOpenInviteModal: () => void;
  onShowInPersonGuestPanel: () => void;
  onRemoveParticipant: (participantId: string) => void | Promise<void>;
};

export function StudioPeopleSidebar(props: StudioPeopleSidebarProps) {
  return (
    <div className="flex">
      {props.showPanel && (
        <aside className="studio-panel-surface w-[336px] rounded-3xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-5xl font-semibold leading-none text-slate-100">People</h2>
            <button
              type="button"
              onClick={props.onClosePanel}
              className="rounded-full border border-slate-700 p-2 text-sm text-slate-400 hover:border-slate-500"
            >
              ×
            </button>
          </div>

          <div className="studio-panel-muted mt-4 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-300">Recording info</p>
              <span className="text-slate-500">⌄</span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {props.people.map((person) => (
              <div key={person.id} className="studio-panel-muted rounded-xl p-3">
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 rounded-md border border-white/10 bg-slate-900/80" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xl font-semibold text-slate-100">{person.label}</p>
                      {props.isRecording && (
                        <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] text-rose-200">REC</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">{person.role}</p>
                    <p className="text-xs text-slate-500">{person.note}</p>
                  </div>
                </div>
                {person.showProgressBar ? (
                  <div className="mt-3 h-1.5 w-full rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-emerald-300/90"
                      style={{ width: `${Math.max(person.percent, 5)}%` }}
                    />
                  </div>
                ) : (
                  <div className="mt-3 h-1.5 w-full rounded-full bg-white/6" />
                )}
                {props.stoppedUploadingPhase && props.canManageParticipants && person.id !== 'local-live' && person.role !== 'Host' && (
                  <button
                    type="button"
                    onClick={() => void props.onRemoveParticipant(person.id)}
                    className="mt-2 w-full rounded border border-red-500/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {props.canManageParticipants && props.showAddParticipantPanel && (
            <div className="studio-panel-muted mt-4 rounded-xl p-3">
              <button
                type="button"
                onClick={props.onOpenInviteModal}
                className="studio-control-surface w-full rounded-xl px-4 py-3 text-left hover:bg-white/8"
              >
                <p className="text-lg font-semibold text-slate-100">Remote guest</p>
                <p className="text-sm text-slate-400">Send a link to someone joining from another device</p>
              </button>
              <button
                type="button"
                onClick={props.onShowInPersonGuestPanel}
                className="mt-3 w-full rounded-xl px-1 py-1 text-left"
              >
                <p className="text-lg font-medium text-slate-200">
                  In-person guest <span className="ml-1 text-lime-300">⚡</span>
                </p>
                <p className="text-sm text-slate-400">Someone recording next to you on the same device</p>
              </button>
            </div>
          )}

          {props.canManageParticipants && (
            <button
              type="button"
              onClick={props.onToggleAddParticipantPanel}
              className="studio-control-surface mt-4 w-full rounded-xl px-3 py-2.5 text-lg text-slate-100"
            >
              + Add participant
            </button>
          )}
        </aside>
      )}

      <div className="studio-panel-muted ml-3 flex w-[88px] shrink-0 flex-col items-center justify-center gap-5 rounded-[30px] py-7">
        <button
          type="button"
          onClick={props.onTogglePanel}
          className={`flex w-[70px] flex-col items-center rounded-[24px] px-2 py-3 text-[13px] font-medium transition-colors ${
            props.showPanel
              ? 'border border-violet-400/30 bg-violet-500/15 text-white'
              : 'bg-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="mb-1">
            <StudioSidebarIcon kind="people" />
          </span>
          People
        </button>
        <button
          type="button"
          className="flex w-[70px] flex-col items-center gap-1 rounded-[20px] px-2 py-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-200"
        >
          <StudioSidebarIcon kind="chat" />
          Chat
        </button>
        <button
          type="button"
          className="flex w-[70px] flex-col items-center gap-1 rounded-[20px] px-2 py-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-200"
        >
          <StudioSidebarIcon kind="brand" />
          Brand
        </button>
        <button
          type="button"
          className="flex w-[70px] flex-col items-center gap-1 rounded-[20px] px-2 py-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-200"
        >
          <StudioSidebarIcon kind="text" />
          Text
        </button>
        <button
          type="button"
          className="flex w-[70px] flex-col items-center gap-1 rounded-[20px] px-2 py-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-200"
        >
          <StudioSidebarIcon kind="media" />
          Media
        </button>
      </div>
    </div>
  );
}
