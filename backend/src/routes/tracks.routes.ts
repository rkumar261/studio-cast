import type { FastifyInstance } from 'fastify';
import { authGuard } from '../middlewares/auth.guard.js';
import { getTrackFinalUrl } from '../services/tracks.service.js';

export default async function tracksRoutes(app: FastifyInstance) {
    app.get<{
        Params: { id: string }
    }>('/v1/tracks/:id/final-url', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        if (!id || id === 'undefined') {
            return res.code(400).send({ code: 'bad_request', message: 'Missing or invalid track id' });
        }

        try {
            const finalUrl = await getTrackFinalUrl(id);
            return res.code(200).send({ status: 'success', data: { finalUrl } });
        } catch (e: any) {
            const code = e?.code === 'final_not_ready' ? 409 : 404;
            return res.code(code).send({
                code: e?.code ?? 'error',
                message: String(e?.message || e),
                data: null,
            });
        }
    });
}