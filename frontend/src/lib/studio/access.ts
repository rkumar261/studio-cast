export type StudioUiRole = 'host' | 'guest';

export type StudioUiAccess = {
  canManageParticipants: boolean;
  canSendInvites: boolean;
  canUseBroadcastControls: boolean;
};

export function deriveStudioUiAccess(role: StudioUiRole): StudioUiAccess {
  const isHost = role === 'host';
  return {
    canManageParticipants: isHost,
    canSendInvites: isHost,
    canUseBroadcastControls: isHost,
  };
}
