'use client';

type InviteRole = 'guest' | 'host';
type CopyState = 'idle' | 'copied' | 'error';

type StudioInviteSidePanelProps = {
  inviteLink: string;
  inviteRole: InviteRole;
  copyState: CopyState;
  onInviteRoleChange: (role: InviteRole) => void;
  onCopyLink: () => void;
  onClose: () => void;
};

export function StudioInviteSidePanel(props: StudioInviteSidePanelProps) {
  return (
    <aside className="studio-panel-surface hidden w-[400px] shrink-0 rounded-3xl p-6 xl:flex xl:flex-col">
      <div className="mb-8 flex items-start justify-between">
        <h2 className="max-w-[260px] text-[44px] font-semibold leading-[0.98] text-slate-100">
          Invite someone to join remotely
        </h2>
        <button
          type="button"
          onClick={props.onClose}
          className="rounded-full border border-slate-700 p-2 text-sm text-slate-300 hover:border-slate-500"
          aria-label="Close invite panel"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_86px_104px] gap-2">
        <input
          type="text"
          readOnly
          value={props.inviteLink}
          className="studio-input-surface min-w-0 truncate rounded-xl px-3 py-2 text-sm text-slate-300"
        />
        <select
          value={props.inviteRole}
          onChange={(event) => props.onInviteRoleChange(event.target.value as InviteRole)}
          className="studio-input-surface rounded-xl px-2 py-2 text-sm"
        >
          <option value="guest">Guest</option>
        </select>
        <button
          type="button"
          onClick={props.onCopyLink}
          className="rounded-xl bg-[var(--workspace-purple)] px-2 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          {props.copyState === 'copied' ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <div className="my-10 flex items-center gap-3 text-slate-500">
        <div className="h-px flex-1 bg-white/10" />
        <span className="rounded-full border border-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.18em]">New</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <p className="text-4xl font-semibold leading-tight text-slate-100">Record someone next to you</p>
      <button
        type="button"
        className="studio-control-surface mt-6 rounded-xl px-4 py-3 text-lg font-medium text-slate-100"
      >
        Add an in-person guest <span className="ml-1 text-lime-300">⚡</span>
      </button>
    </aside>
  );
}
