import type { FastifyInstance } from 'fastify';
import { authGuard } from '../middlewares/auth.guard.js';
import type { GetProjectAssetsGraphResponse } from '../dto/recordings/project-assets.dto.js';
import type { RecordingLifecycleDiagnosticsResponse } from '../dto/recordings/lifecycle-diagnostics.dto.js';
import { getProjectAssetsGraphService } from '../services/project-assets.service.js';
import { getRecordingLifecycleDiagnosticsService } from '../services/recording-lifecycle.service.js';
import { getRecordingProgressService } from '../services/recording-progress.service.js';
import { requireOwnerUser, requirePrincipal } from './recordings.route-helpers.js';

export default async function recordingAssetsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/v1/recordings/:id/project-assets',
    { preHandler: authGuard },
    async (req, res) => {
      const requesterId = requireOwnerUser(req, res, {
        action: 'project_assets',
        recordingId: req.params.id,
      });
      if (!requesterId) return;

      const result = await getProjectAssetsGraphService({
        recordingId: req.params.id,
        requesterId,
      });

      if (result.code === 'not_found') {
        return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
      }
      if (result.code === 'forbidden') {
        return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
      }

      return res.code(200).send(result.data as GetProjectAssetsGraphResponse);
    }
  );

  app.get<{ Params: { id: string } }>(
    '/v1/recordings/:id/lifecycle-diagnostics',
    { preHandler: authGuard },
    async (req, res) => {
      const requesterId = requireOwnerUser(req, res, {
        action: 'lifecycle_diagnostics',
        recordingId: req.params.id,
      });
      if (!requesterId) return;

      const result = await getRecordingLifecycleDiagnosticsService({
        recordingId: req.params.id,
        requesterId,
      });

      if (result.code === 'not_found') {
        return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
      }
      if (result.code === 'forbidden') {
        return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
      }

      return res.code(200).send(result.data as RecordingLifecycleDiagnosticsResponse);
    }
  );

  app.get<{ Params: { id: string } }>(
    '/v1/recordings/:id/progress',
    { preHandler: authGuard },
    async (req, res) => {
      const principal = requirePrincipal(req, res);
      if (!principal) return;

      const result = await getRecordingProgressService({
        recordingId: req.params.id,
        principal,
      });

      if (result.code === 'not_found') {
        return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
      }
      if (result.code === 'forbidden') {
        return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
      }

      return res.code(200).send(result.data);
    }
  );
}
