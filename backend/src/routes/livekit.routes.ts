import type { FastifyInstance } from 'fastify';
import { AccessToken } from 'livekit-server-sdk';
import { authGuard } from '../middlewares/auth.guard.js';
import { getRequestPrincipal } from '../lib/request-principal.js';

type LivekitTokenBody = {
  roomName: string;
};

type LivekitTokenResponse = {
  token: string;
  wsUrl: string;
};

export default async function livekitRoutes(app: FastifyInstance) {
  app.post<{ Body: LivekitTokenBody }>(
    '/v1/livekit/token',
    { preHandler: authGuard },
    async (req, res) => {
      const principal = getRequestPrincipal(req);
      if (!principal) {
        return res.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      }

      const requester = (req as any).user as
        | { id?: string; name?: string | null; email?: string | null }
        | undefined;
      const guest = (req as any).guest as
        | { participantId?: string; displayName?: string | null; email?: string | null }
        | undefined;

      const body = (req.body ?? {}) as LivekitTokenBody;
      const roomName = body.roomName?.trim();
      if (!roomName) {
        return res
          .code(400)
          .send({ error: 'bad_request', message: 'roomName is required' });
      }
      if (principal.kind === 'guest' && principal.recordingId !== roomName) {
        return res
          .code(403)
          .send({ error: 'forbidden', message: 'Guest token request is out of recording scope' });
      }

      const identity =
        principal.kind === 'guest'
          ? principal.participantId
          : (requester?.id ? String(requester.id) : '');
      if (!identity) {
        return res
          .code(401)
          .send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
      }

      const wsUrl = process.env.LIVEKIT_WS_URL ?? 'ws://localhost:7880';

      const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity,
        name:
          principal.kind === 'guest'
            ? (guest?.displayName ?? guest?.email ?? guest?.participantId ?? identity)
            : (requester?.name ?? requester?.email ?? identity),
      });

      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const jwt = await token.toJwt();
      const response: LivekitTokenResponse = { token: jwt, wsUrl };

      return res.code(200).send(response);
    }
  );

}
