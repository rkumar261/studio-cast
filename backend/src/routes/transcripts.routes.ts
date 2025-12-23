import type { FastifyInstance } from 'fastify';
import { authGuard } from '../middlewares/auth.guard.js';
import { getTranscriptByRecordingIdService } from '../services/transcripts.service.js';

export default async function transcriptsRoutes(app: FastifyInstance) {
    app.get<{ Params: { id: string } }>(
        '/v1/recordings/:id/transcript',
        { preHandler: authGuard },
        async (req, res) => {
            const requesterId = (req as any).user?.id as string | undefined;
            if (!requesterId) {
                return res
                    .code(401)
                    .send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
            }

            const { id } = req.params;

            const result = await getTranscriptByRecordingIdService({
                recordingId: id,
                requesterId,
            });

            if (result.code === 'not_found') {
                return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
            }
            if (result.code === 'forbidden') {
                return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
            }

            return res.code(200).send(result.data);
        },
    );
}
