import type { FastifyInstance } from 'fastify';
import { CreateParticipantRequestBody, CreateParticipantResponse } from '../dto/participants/create.dto.js';
import { createParticipantService } from '../services/participants.service.js';

export default async function participantRoutes(app: FastifyInstance) {

    app.post('v1/recordings/:id/participants', async (req, res) => {
    
        const anyReq = req as any;
        const requestId: string | null = anyReq.user?.id ?? null;

        const { id } = req.params as { id: string };
        const body = req.body as CreateParticipantRequestBody;

        const result = await createParticipantService(id, requestId, body);

        if (result.code === 'not_found') {
            return res.status(404).send({ code: 'not_found', message: 'Recording not found' });
        }

        if (result.code === 'forbidden') {
            return res.status(403).send({ code: 'forbidden', message: 'You do not have permission to add participants to this recording' });
        }

        const response: CreateParticipantResponse = result.data;
        return res.status(201).send(response);
    });
}