import type { FastifyInstance, FastifyRequest } from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { authGuard } from '../middlewares/auth.guard.js';
import { handleStudioWsConnection } from '../websocket/studioWebsocket.js';
import { getRequestPrincipal } from '../lib/request-principal.js';

export default async function studioWebsocketRoutes(app: FastifyInstance) {
  await app.register(websocketPlugin);

  app.get(
    '/v1/studio/signaling',
    {
      websocket: true,
      preHandler: authGuard,
    },
    (connection, req: FastifyRequest) => {
      const principal = getRequestPrincipal(req);

      if (!principal) {
        // authGuard should prevent this, but be defensive
        try {
          (connection as any).socket?.close(1008, 'Unauthorized');
        } catch {
          /* ignore */
        }
        return;
      }

      // pass app, connection, req – matches handleStudioWsConnection
      handleStudioWsConnection(app, connection, req, principal);
    }
  );
}
