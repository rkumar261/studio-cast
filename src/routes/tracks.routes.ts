import type { FastifyInstance } from 'fastify';
import { getTrackFinalUrl } from '../services/tracks.service.js';

export default async function tracksRoutes(app: FastifyInstance) {
    app.get('/v1/tracks/:id/final-url', async (req, res) => {
        try {
            const { id } = req.params as { id: string };
            console.log('Fetching final URL for track ID:', id);
            // Call your service to get the final URL for the track
            const finalUrl = await getTrackFinalUrl(id);
            return res.code(200).send({ finalUrl });
        } catch (e: any) {
            const code = e?.code === 'final_not_ready' ? 409 : 404;
            return res.code(code).send({ code: e?.code ?? 'error', message: String(e?.message || e) });
        }
    });
}
