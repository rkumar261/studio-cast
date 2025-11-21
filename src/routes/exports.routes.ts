import type { FastifyInstance } from 'fastify';
import { authGuard } from '../middlewares/auth.guard.js';
import type {
    CreateExportBody,
    CreateExportResponse,
} from '../dto/exports/create.dto.js';
import type {
    ListExportsResponse,
    GetExportResponse,
} from '../dto/exports/get.dto.js';
import { createExportService, listExportsService, getExportService } from '../services/exports.service.js';
import { export_type } from '@prisma/client';

export default async function exportsRoutes(app: FastifyInstance) {
    // Create / request export
    app.post<{ Body: CreateExportBody }>(
        '/v1/exports',
        { preHandler: authGuard },
        async (req, res) => {
            const requesterId = (req as any).user?.id as string | undefined;
            if (!requesterId) {
                return res
                    .code(401)
                    .send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
            }

            const body = (req.body ?? {}) as CreateExportBody;
            const type = body.type as export_type;

            const result = await createExportService({
                recordingId: body.recordingId,
                type,
                requesterId,
            });

            if (result.code !== 'ok') {
                if (result.code === 'not_found') {
                    return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
                }
                return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
            }

            const data: CreateExportResponse = result.data;
            return res.code(202).send(data);
        },
    );

    // List exports for a recording
    app.get<{ Params: { id: string } }>(
        '/v1/recordings/:id/exports',
        { preHandler: authGuard },
        async (req, res) => {
            const requesterId = (req as any).user?.id as string | undefined;
            if (!requesterId) {
                return res
                    .code(401)
                    .send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
            }

            const { id } = req.params;

            const result = await listExportsService({
                recordingId: id,
                requesterId,
            });

            if (result.code !== 'ok') {
                if (result.code === 'not_found') {
                    return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
                }
                return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
            }

            const data: ListExportsResponse = result.data;
            return res.code(200).send(data);
        },
    );

    // Get a single export (status + optional download URL)
    app.get<{ Params: { id: string } }>(
        '/v1/exports/:id',
        { preHandler: authGuard },
        async (req, res) => {
            const requesterId = (req as any).user?.id as string | undefined;
            if (!requesterId) {
                return res
                    .code(401)
                    .send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
            }

            const { id } = req.params;

            const result = await getExportService({
                exportId: id,
                requesterId,
            });

            if (result.code !== 'ok') {
                if (result.code === 'not_found') {
                    return res.code(404).send({ code: 'not_found', message: 'Export not found' });
                }
                return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
            }

            const data: GetExportResponse = result.data;
            return res.code(200).send(data);
        },
    );
}
