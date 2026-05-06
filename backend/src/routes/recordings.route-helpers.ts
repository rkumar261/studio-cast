import type { FastifyReply, FastifyRequest } from 'fastify';
import { getRequestPrincipal, type RequestPrincipal } from '../lib/request-principal.js';
import { emitTelemetry } from '../lib/telemetry.js';

type GuestContext = {
  participantId?: string;
  recordingId?: string;
};

export function emitGuestAccessBlocked(
  req: FastifyRequest,
  args: {
    recordingId?: string;
    participantId?: string;
    action: string;
    reason: string;
  }
) {
  emitTelemetry({
    logger: req.log,
    level: 'warn',
    event: 'guest.access.blocked',
    message: 'Guest action blocked',
    actorKind: 'guest',
    recordingId: args.recordingId,
    participantId: args.participantId,
    action: args.action,
    reason: args.reason,
    ip: req.ip,
    userAgent: req.headers['user-agent'] ?? null,
  });
}

function getGuestContext(req: FastifyRequest): GuestContext | undefined {
  return (req as any).guest as GuestContext | undefined;
}

export function requireOwnerUser(
  req: FastifyRequest,
  reply: FastifyReply,
  args: {
    action: string;
    recordingId?: string;
  }
): string | null {
  const requesterId = (req as any).user?.id as string | undefined;
  const guest = getGuestContext(req);

  if (requesterId) return requesterId;

  if (guest?.participantId) {
    emitGuestAccessBlocked(req, {
      recordingId: args.recordingId ?? guest.recordingId,
      participantId: guest.participantId,
      action: args.action,
      reason: 'owner_credentials_required',
    });
    void reply.code(403).send({ code: 'forbidden', message: 'Not allowed' });
    return null;
  }

  void reply
    .code(401)
    .send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
  return null;
}

export function requirePrincipal(
  req: FastifyRequest,
  reply: FastifyReply
): RequestPrincipal | null {
  const principal = getRequestPrincipal(req);
  if (principal) return principal;

  void reply
    .code(401)
    .send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
  return null;
}
