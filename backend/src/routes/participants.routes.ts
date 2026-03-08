import type { FastifyInstance } from 'fastify';
import { CreateParticipantRequestBody, CreateParticipantResponse } from '../dto/participants/create.dto.js';
import type {
  ClaimGuestParticipantBody,
  ClaimGuestParticipantResponse,
} from '../dto/participants/claim.dto.js';
import { claimGuestParticipantService, createParticipantService } from '../services/participants.service.js';
import type { GetParticipantsResponse } from '../dto/participants/get.dto.js';
import { listParticipantsService } from '../services/participants.service.js';
import { authGuard } from '../middlewares/auth.guard.js';

const COOKIE_SECURE = String(process.env.COOKIE_SECURE ?? 'false') === 'true';

export default async function participantRoutes(app: FastifyInstance) {
  app.post<{ Body: ClaimGuestParticipantBody }>(
    '/v1/participants/claim',
    async (req, res) => {
      const body = req.body ?? { token: '' };
      const result = await claimGuestParticipantService(body);
      if (result.code === 'invalid_token') {
        return res.code(401).send({ code: 'invalid_token', message: 'Invalid or expired guest invite token' });
      }

      res.setCookie('guest_access_token', result.guestAccessToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: COOKIE_SECURE,
      });

      return res.code(200).send(result.data as ClaimGuestParticipantResponse);
    }
  );

  app.post<{
    Params: { id: string };
    Body: CreateParticipantRequestBody;
  }>('/v1/recordings/:id/participants', { preHandler: authGuard }, async (req, res) => {
    const requesterId = (req as any).user?.id ?? null;
    const { id } = req.params;
    const body = req.body;

    const result = await createParticipantService(id, requesterId, body);
    if (result.code === 'not_found')  return res.status(404).send({ code: 'not_found', message: 'Recording not found' });
    if (result.code === 'forbidden')  return res.status(403).send({ code: 'forbidden', message: 'You do not have permission' });

    return res.status(201).send(result.data as CreateParticipantResponse);
  });

  app.get<{ Params: { id: string } }>(
    '/v1/recordings/:id/participants',
    { preHandler: authGuard },
    async (req, res) => {
      const requesterId = (req as any).user?.id ?? null;
      const { id } = req.params;

      const result = await listParticipantsService(id, requesterId);
      if (result.code === 'not_found') return res.code(404).send({ code: 'not_found' });
      if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden' });

      return res.code(200).send(result.data as GetParticipantsResponse);
    }
  );
}
