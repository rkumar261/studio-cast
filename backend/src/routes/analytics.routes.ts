import type { FastifyInstance } from 'fastify';
import { authGuard } from '../middlewares/auth.guard.js';
import type { AnalyticsSummaryResponse } from '../dto/analytics/summary.dto.js';
import { getAnalyticsSummaryService } from '../services/analytics.service.js';

export default async function analyticsRoutes(app: FastifyInstance) {
  app.get('/v1/analytics/summary', { preHandler: authGuard }, async (req, res) => {
    const requesterId = (req as any).user?.id as string | undefined;
    const guest = (req as any).guest as { participantId?: string } | undefined;

    if (!requesterId) {
      if (guest?.participantId) {
        return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
      }
      return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
    }

    const summary = await getAnalyticsSummaryService(requesterId);
    return res.code(200).send(summary as AnalyticsSummaryResponse);
  });
}
