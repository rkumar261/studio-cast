import type { FastifyInstance } from 'fastify';
import { authGuard } from '../middlewares/auth.guard.js';
import type { SaveTranscriptRequest } from '../dto/transcripts/get.dto.js';
import {
    getTranscriptByRecordingIdService,
    saveTranscriptRevisionService,
} from '../services/transcripts.service.js';

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

            if (result.code !== 'ok') {
                if (result.code === 'not_found') {
                    return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
                }
                return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
            }

            return res.code(200).send(result.data);
        },
    );

    app.put<{ Params: { id: string }; Body: SaveTranscriptRequest }>(
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
            const body = (req.body ?? {}) as SaveTranscriptRequest;

            const result = await saveTranscriptRevisionService({
                recordingId: id,
                requesterId,
                input: body,
            });

            if (result.code !== 'ok') {
                switch (result.code) {
                    case 'not_found':
                        return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
                    case 'forbidden':
                        return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
                    case 'bad_request':
                        return res.code(400).send({ code: 'bad_request', message: result.message });
                    case 'conflict':
                        return res.code(409).send({
                            code: 'revision_conflict',
                            message: 'Transcript has a newer revision. Refresh and re-apply edits.',
                            details: { latestRevision: result.latestRevision },
                        });
                }
            }

            return res.code(200).send(result.data);
        },
    );
}
