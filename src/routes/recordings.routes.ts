import type { FastifyInstance  } from 'fastify';
import type { CreateRecordingBody, CreateRecordingResponse } from '../dto/recordings/create.dto.js';
import { createRecordingService, getRecordingService } from '../services/recordings.service.js';
import type { GetRecordingResponse } from '../dto/recordings/get.dto.js';
import { ListRecordingsResponse } from '../dto/recordings/list.dto.js';
import { listRecordingService } from '../services/recordings.service.js';

export default async function recordingRoutes(app: FastifyInstance ) {

    app.post('/v1/recordings', async (req, res) => {

        const anyReq = req as any;
        const userId: string | undefined = anyReq.user?.id;

        const body = (req.body ?? {}) as CreateRecordingBody;

        if (!userId) return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });

        const recording = await createRecordingService({
            userId: userId ?? null,
            title: body.title 
        });

        const response: CreateRecordingResponse = { recording };

        return res.code(201).send(response);
    });

    app.get('/v1/recordings:id', async (req, res) => { 

        const anyReq = req as any;
        const requesterId: string | undefined = anyReq.user?.id;

        if (!requesterId) return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });

        const { id } = req.params as { id: string };

        const result = await getRecordingService({ id, requesterId: requesterId ?? null });
        
        if (result.code === 'not_found') {
            return res.code(404).send(null);
        }

        if (result.code === 'forbidden') {
            return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        }

        const response: GetRecordingResponse = result.data;
        return res.code(200).send(response);
    });

    app.get('/v1/recordings', async (req, res) => {
        const ayReq = req as any;
        const userId: string | undefined = ayReq.user?.id;

        if (!userId) return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        
        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        const parseLimit = limit ? Math.min(parseInt(limit, 10), 100) : 20;

        const result: ListRecordingsResponse = await listRecordingService(userId, parseLimit, cursor);

        return res.code(200).send(result);
    });
}