import type { FastifyInstance } from 'fastify';
import { authGuard } from '../middlewares/auth.guard.js';
import type { CreateRecordingBody, CreateRecordingResponse } from '../dto/recordings/create.dto.js';
import type { GetRecordingResponse } from '../dto/recordings/get.dto.js';
import { ListRecordingsResponse } from '../dto/recordings/list.dto.js';
import {
  createRecordingService,
  getRecordingService,
  listRecordingService,
  renameRecordingService,
} from '../services/recordings.service.js';
import { requireOwnerUser } from './recordings.route-helpers.js';

export default async function recordingCrudRoutes(app: FastifyInstance) {
  app.post('/v1/recordings', { preHandler: authGuard }, async (req, res) => {
    const userId = requireOwnerUser(req, res, { action: 'recording_create' });
    if (!userId) return;

    const body = (req.body ?? {}) as CreateRecordingBody;
    const recording = await createRecordingService({
      userId,
      title: body.title,
    });

    const response: CreateRecordingResponse = { recording };
    return res.code(201).send(response);
  });

  app.get<{ Params: { id: string } }>(
    '/v1/recordings/:id',
    { preHandler: authGuard },
    async (req, res) => {
      const requesterId = requireOwnerUser(req, res, {
        action: 'recording_detail',
        recordingId: req.params.id,
      });
      if (!requesterId) return;

      const result = await getRecordingService({ id: req.params.id, requesterId });

      if (result.code === 'not_found') {
        return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
      }
      if (result.code === 'forbidden') {
        return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
      }

      return res.code(200).send(result.data as GetRecordingResponse);
    }
  );

  app.patch<{ Params: { id: string }; Body: { title?: string | null } }>(
    '/v1/recordings/:id',
    { preHandler: authGuard },
    async (req, res) => {
      const requesterId = requireOwnerUser(req, res, {
        action: 'recording_rename',
        recordingId: req.params.id,
      });
      if (!requesterId) return;

      const result = await renameRecordingService({
        id: req.params.id,
        requesterId,
        title: req.body?.title,
      });

      if (result.code === 'not_found') {
        return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
      }
      if (result.code === 'forbidden') {
        return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
      }

      return res.code(200).send(result.data as GetRecordingResponse);
    }
  );

  app.get('/v1/recordings', { preHandler: authGuard }, async (req, res) => {
    const userId = requireOwnerUser(req, res, { action: 'recording_list' });
    if (!userId) return;

    const { limit, cursor } = req.query as { limit?: string; cursor?: string };
    const parseLimit = limit ? Math.min(parseInt(limit, 10), 100) : 20;
    const result: ListRecordingsResponse = await listRecordingService(userId, parseLimit, cursor);
    return res.code(200).send(result);
  });
}
