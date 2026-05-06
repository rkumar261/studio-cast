'use client';

type InviteRole = 'guest' | 'host';
type CopyState = 'idle' | 'copied' | 'error';

type StudioInviteModalProps = {
  open: boolean;
  inviteLink: string;
  inviteRole: InviteRole;
  inviteEmail: string;
  inviteNotice: string | null;
  copyState: CopyState;
  onInviteRoleChange: (role: InviteRole) => void;
  onInviteEmailChange: (email: string) => void;
  onCopyLink: () => void;
  onSendInvite: () => void;
  onClose: () => void;
};

export function StudioInviteModal(props: StudioInviteModalProps) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="studio-panel-surface w-full max-w-[760px] rounded-3xl p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-4xl font-semibold text-slate-100">Invite people</h3>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full border border-slate-600 p-2 text-sm text-slate-300 hover:border-slate-400"
          >
            ×
          </button>
        </div>
        <p className="text-base text-slate-400">
          Invite people to join your recording session.{' '}
          <span className="text-[#b692ff]">About studio roles</span>
        </p>

        <div className="mt-6 space-y-3">
          <p className="text-2xl font-semibold text-slate-100">Share a link</p>
          <p className="text-sm text-slate-400">Copy the link below and share with others.</p>
          <div className="grid gap-2 md:grid-cols-[1fr_108px_120px]">
            <input
              type="text"
              readOnly
              value={props.inviteLink}
              className="studio-input-surface rounded-xl px-3 py-3 text-sm text-slate-100"
            />
            <select
              value={props.inviteRole}
              onChange={(event) => props.onInviteRoleChange(event.target.value as InviteRole)}
              className="studio-input-surface rounded-xl px-3 py-3 text-sm text-slate-100"
            >
              <option value="guest">Guest</option>
            </select>
            <button
              type="button"
              onClick={props.onCopyLink}
              className="rounded-xl bg-[var(--workspace-purple)] px-3 py-3 text-sm font-semibold text-white hover:brightness-110"
            >
              {props.copyState === 'copied' ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-slate-400">Or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="space-y-3">
          <p className="text-2xl font-semibold text-slate-100">Invite via email</p>
          <p className="text-sm text-slate-400">
            An email with instructions on how to join will be sent to all invitees.
          </p>
          <div className="grid gap-2 md:grid-cols-[1fr_108px_120px]">
            <input
              type="email"
              value={props.inviteEmail}
              onChange={(event) => props.onInviteEmailChange(event.target.value)}
              placeholder="example@email.com"
              className="studio-input-surface rounded-xl px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500"
            />
            <select
              value={props.inviteRole}
              onChange={(event) => props.onInviteRoleChange(event.target.value as InviteRole)}
              className="studio-input-surface rounded-xl px-3 py-3 text-sm text-slate-100"
            >
              <option value="guest">Guest</option>
            </select>
            <button
              type="button"
              onClick={props.onSendInvite}
              className="rounded-xl bg-[var(--workspace-purple)] px-3 py-3 text-sm font-semibold text-white hover:brightness-110"
            >
              Send invite
            </button>
          </div>
        </div>

        {props.inviteNotice && (
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {props.inviteNotice}
          </p>
        )}
      </div>
    </div>
  );
}
