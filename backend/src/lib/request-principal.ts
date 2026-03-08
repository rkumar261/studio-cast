import type { FastifyRequest } from 'fastify';

export type UserPrincipal = {
  kind: 'user';
  userId: string;
};

export type GuestPrincipal = {
  kind: 'guest';
  participantId: string;
  recordingId: string;
};

export type RequestPrincipal = UserPrincipal | GuestPrincipal;

export function getRequestPrincipal(req: FastifyRequest): RequestPrincipal | null {
  const authPrincipal = (req as any).auth as RequestPrincipal | undefined;
  if (authPrincipal?.kind === 'user' || authPrincipal?.kind === 'guest') {
    return authPrincipal;
  }

  const userId = (req as any).user?.id as string | undefined;
  if (userId) return { kind: 'user', userId };

  const guest = (req as any).guest as { participantId?: string; recordingId?: string } | undefined;
  if (guest?.participantId && guest?.recordingId) {
    return {
      kind: 'guest',
      participantId: guest.participantId,
      recordingId: guest.recordingId,
    };
  }

  return null;
}

export function isUserPrincipal(principal: RequestPrincipal | null): principal is UserPrincipal {
  return !!principal && principal.kind === 'user';
}

export function isGuestPrincipal(principal: RequestPrincipal | null): principal is GuestPrincipal {
  return !!principal && principal.kind === 'guest';
}
