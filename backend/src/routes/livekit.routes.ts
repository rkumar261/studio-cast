import type { FastifyInstance } from 'fastify';
import { AccessToken } from 'livekit-server-sdk';
import { authGuard } from '../middlewares/auth.guard.js';

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
      const requester = (req as any).user as
        | { id?: string; name?: string | null; email?: string | null }
        | undefined;

      if (!requester?.id) {
        return res
          .code(401)
          .send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
      }

      const body = (req.body ?? {}) as LivekitTokenBody;
      const roomName = body.roomName?.trim();
      if (!roomName) {
        return res
          .code(400)
          .send({ error: 'bad_request', message: 'roomName is required' });
      }

      const wsUrl = process.env.LIVEKIT_WS_URL ?? 'ws://localhost:7880';

      const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity: String(requester.id),
        name: requester.name ?? requester.email ?? undefined,
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