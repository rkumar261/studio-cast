import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessJwt } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';  // or your repo wrapper

/*************  ✨ Windsurf Command ⭐  *************/
/*******  a75e7a4a-724a-43b5-a7b6-5844ff659e4a  *******/
export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
  try {
    const bearer = req.headers.authorization?.split(' ')[1];
    const cookieJwt = (req.cookies as any)?.access_token as string | undefined;
    const guestCookieJwt = (req.cookies as any)?.guest_access_token as string | undefined;
    const jwt = bearer ?? cookieJwt ?? guestCookieJwt;

    if (!jwt) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }

    const { payload } = await verifyAccessJwt(jwt);
    const principalType = String((payload as any).principalType ?? '');

    if (principalType === 'guest') {
      const participantId = String((payload as any).participantId ?? '').trim();
      const recordingId = String((payload as any).recordingId ?? '').trim();
      if (!participantId || !recordingId) {
        return reply.code(401).send({ error: 'unauthenticated' });
      }

      const participant = await prisma.participant.findUnique({
        where: { id: participantId },
        select: {
          id: true,
          recording_id: true,
          role: true,
          display_name: true,
          email: true,
        },
      });

      if (!participant || participant.role !== 'guest' || participant.recording_id !== recordingId) {
        return reply.code(401).send({ error: 'unauthenticated' });
      }

      (req as any).guest = {
        participantId: participant.id,
        recordingId: participant.recording_id,
        role: participant.role,
        displayName: participant.display_name ?? undefined,
        email: participant.email ?? undefined,
      };
      (req as any).auth = {
        kind: 'guest',
        participantId: participant.id,
        recordingId: participant.recording_id,
      };
      return;
    }

    const userId = String(payload.sub);

    // Fetch user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, imageUrl: true },
    });

    if (!user) {
      return reply.code(401).send({ error: 'user_not_found' });
    }

    (req as any).user = user;
    (req as any).auth = { kind: 'user', userId: user.id };
  } catch (err) {
    return reply.code(401).send({ error: 'unauthenticated' });
  }
}
