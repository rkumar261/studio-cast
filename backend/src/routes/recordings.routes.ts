import type { FastifyInstance } from 'fastify';
import type { CreateRecordingBody, CreateRecordingResponse } from '../dto/recordings/create.dto.js';
import type { CompleteTrackChunkBody, CompleteTrackChunkResponse } from '../dto/chunks/complete.dto.js';
import type { InitiateTrackChunkBody, InitiateTrackChunkResponse } from '../dto/chunks/initiate.dto.js';
import type { RegisterTrackBody, RegisterTrackResponse } from '../dto/tracks/register.dto.js';
import { createRecordingService, getRecordingService } from '../services/recordings.service.js';
import type { GetRecordingResponse } from '../dto/recordings/get.dto.js';
import { ListRecordingsResponse } from '../dto/recordings/list.dto.js';
import { listRecordingService } from '../services/recordings.service.js';
import { authGuard } from '../middlewares/auth.guard.js';
import {
    getRecordingSessionService,
    startRecordingSessionService,
    stopRecordingSessionService,
} from '../services/recording-session.service.js';
import { getRecordingProgressService } from '../services/recording-progress.service.js';
import { registerTrackIdentityService } from '../services/track-registration.service.js';
import { completeTrackChunkService, initiateTrackChunkService } from '../services/track-chunk.service.js';
import { broadcastStudioRoomEvent } from '../websocket/studioWebsocket.js';

export default async function recordingRoutes(app: FastifyInstance) {

    app.post('/v1/recordings', { preHandler: authGuard }, async (req, res) => {

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

    // if you DO NOT use a prefix when registering this plugin:
    app.get<{
        Params: { id: string }
    }>('/v1/recordings/:id', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const result = await getRecordingService({ id, requesterId });

        if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });

        return res.code(200).send(result.data as GetRecordingResponse);
    });


    app.get('/v1/recordings', { preHandler: authGuard }, async (req, res) => {
        const ayReq = req as any;
        const userId: string | undefined = ayReq.user?.id;

        if (!userId) return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });

        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        const parseLimit = limit ? Math.min(parseInt(limit, 10), 100) : 20;

        const result: ListRecordingsResponse = await listRecordingService(userId, parseLimit, cursor);

        return res.code(200).send(result);
    });

    app.get<{
        Params: { id: string }
    }>('/v1/recordings/:id/session', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const result = await getRecordingSessionService({ recordingId: id, requesterId });

        if (result.code !== 'ok') {
            if (result.code === 'not_found') {
                return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
            }
            return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        }

        return res.code(200).send(result.data);
    });

    app.post<{
        Params: { id: string }
    }>('/v1/recordings/:id/session/start', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const result = await startRecordingSessionService({ recordingId: id, requesterId });

        if (result.code !== 'ok') {
            if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
            if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
            return res.code(409).send({ code: 'invalid_transition', message: result.message });
        }

        // Studio room id equals recording id in this app
        broadcastStudioRoomEvent(id, { type: 'recording.started', roomId: id, session: result.data.session });

        return res.code(200).send(result.data);
    });

    app.post<{
        Params: { id: string }
    }>('/v1/recordings/:id/session/stop', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const result = await stopRecordingSessionService({ recordingId: id, requesterId });

        if (result.code !== 'ok') {
            if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
            if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
            return res.code(409).send({ code: 'invalid_transition', message: result.message });
        }

        broadcastStudioRoomEvent(id, { type: 'recording.stop_requested', roomId: id, session: result.data.session });

        return res.code(200).send(result.data);
    });

    app.get<{
        Params: { id: string }
    }>('/v1/recordings/:id/progress', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const result = await getRecordingProgressService({ recordingId: id, requesterId });

        if (result.code === 'not_found') {
            return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        }
        if (result.code === 'forbidden') {
            return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        }

        return res.code(200).send(result.data);
    });

    app.post<{
        Params: { id: string };
        Body: RegisterTrackBody;
    }>('/v1/recordings/:id/tracks/register', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const body = req.body;
        const result = await registerTrackIdentityService({ recordingId: id, requesterId, body });

        if (result.code === 'not_found') {
            return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        }
        if (result.code === 'forbidden') {
            return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        }
        if (result.code === 'participant_not_found') {
            return res.code(404).send({ code: 'participant_not_found', message: 'Participant not found' });
        }
        if (result.code === 'invalid_participant') {
            return res.code(422).send({
                code: 'invalid_participant',
                message: 'Participant does not belong to this recording',
            });
        }

        return res.code(200).send(result.data as RegisterTrackResponse);
    });

    app.post<{
        Params: { id: string };
        Body: InitiateTrackChunkBody;
    }>('/v1/recordings/:id/chunks/initiate', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const body = req.body;
        const result = await initiateTrackChunkService({ recordingId: id, requesterId, body });

        if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        if (result.code === 'invalid_track') {
            return res.code(422).send({ code: 'invalid_track', message: 'Track does not belong to this recording' });
        }
        if (result.code === 'invalid_protocol') {
            return res.code(422).send({ code: 'invalid_protocol', message: 'Unsupported chunk protocol' });
        }
        if (result.code === 'invalid_seq' || result.code === 'seq_integrity_error') {
            return res.code(409).send({ code: result.code, message: result.message });
        }

        return res.code(200).send(result.data as InitiateTrackChunkResponse);
    });

    app.post<{
        Params: { id: string; chunkId: string };
        Body: CompleteTrackChunkBody;
    }>('/v1/recordings/:id/chunks/:chunkId/complete', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id, chunkId } = req.params;
        const body = req.body;
        const result = await completeTrackChunkService({
            recordingId: id,
            chunkId,
            requesterId,
            body,
        });

        if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Chunk or recording not found' });
        if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        if (result.code === 'invalid_track') {
            return res.code(422).send({ code: 'invalid_track', message: 'Chunk track does not belong to this recording' });
        }
        if (result.code === 'invalid_protocol') {
            return res.code(422).send({ code: 'invalid_protocol', message: 'Unsupported chunk protocol' });
        }
        if (result.code === 'invalid_seq' || result.code === 'seq_integrity_error') {
            return res.code(409).send({ code: result.code, message: result.message });
        }

        return res.code(200).send(result.data as CompleteTrackChunkResponse);
    });

    app.post<{
        Params: { id: string };
        Body: { trackId: string; seq: number; bytesExpected?: number };
    }>('/v1/recordings/:id/chunks/multipart/initiate', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const body = req.body;
        const result = await initiateTrackChunkService({
            recordingId: id,
            requesterId,
            body: {
                trackId: body.trackId,
                seq: body.seq,
                bytesExpected: body.bytesExpected,
                protocol: 'multipart',
            },
        });

        if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        if (result.code === 'invalid_track') {
            return res.code(422).send({ code: 'invalid_track', message: 'Track does not belong to this recording' });
        }
        if (result.code === 'invalid_protocol') {
            return res.code(422).send({ code: 'invalid_protocol', message: 'Unsupported chunk protocol' });
        }
        if (result.code === 'invalid_seq' || result.code === 'seq_integrity_error') {
            return res.code(409).send({ code: result.code, message: result.message });
        }

        return res.code(200).send(result.data as InitiateTrackChunkResponse);
    });

    app.post<{
        Params: { id: string; chunkId: string };
        Body: Omit<CompleteTrackChunkBody, 'protocol'>;
    }>('/v1/recordings/:id/chunks/multipart/:chunkId/complete', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id, chunkId } = req.params;
        const body = req.body;
        const result = await completeTrackChunkService({
            recordingId: id,
            chunkId,
            requesterId,
            body: {
                ...body,
                protocol: 'multipart',
            },
        });

        if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Chunk or recording not found' });
        if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        if (result.code === 'invalid_track') {
            return res.code(422).send({ code: 'invalid_track', message: 'Chunk track does not belong to this recording' });
        }
        if (result.code === 'invalid_protocol') {
            return res.code(422).send({ code: 'invalid_protocol', message: 'Unsupported chunk protocol' });
        }
        if (result.code === 'invalid_seq' || result.code === 'seq_integrity_error') {
            return res.code(409).send({ code: result.code, message: result.message });
        }

        return res.code(200).send(result.data as CompleteTrackChunkResponse);
    });
}
