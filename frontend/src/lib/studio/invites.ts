type BuildStudioInviteLinkArgs = {
  origin: string;
  recordingId: string;
  role: 'guest' | 'host';
  participantId?: string | null;
  guestToken?: string | null;
};

// Existing invite links may arrive either as full URLs, relative URLs, or raw token paths.
// Preserve all three formats so old invites remain joinable after refactors.
export function tokenFromMagicLink(magicLink?: string): string | null {
  if (!magicLink) return null;

  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(magicLink, baseOrigin);
    const fromQuery = parsed.searchParams.get('guestToken')?.trim();
    if (fromQuery) return fromQuery;
    const segment = parsed.pathname.split('/').filter(Boolean).pop()?.trim();
    return segment || null;
  } catch {
    const segment = magicLink.split('/').filter(Boolean).pop()?.trim();
    return segment || null;
  }
}

export function buildStudioInviteLink(args: BuildStudioInviteLinkArgs) {
  const url = new URL(`/studio/${args.recordingId}`, args.origin);
  url.searchParams.set('mode', 'studio');
  url.searchParams.set('role', args.role);
  if (args.participantId) {
    url.searchParams.set('participantId', args.participantId);
  }
  if (args.role === 'guest' && args.guestToken) {
    url.searchParams.set('guestToken', args.guestToken);
  }
  return url.toString();
}
