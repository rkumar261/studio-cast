import type { FastifyInstance } from 'fastify';
import type { CreateRecordingBody, CreateRecordingResponse } from '../dto/recordings/create.dto.js';
import type { CompleteTrackChunkBody, CompleteTrackChunkResponse } from '../dto/chunks/complete.dto.js';
import type { InitiateTrackChunkBody, InitiateTrackChunkResponse } from '../dto/chunks/initiate.dto.js';
import type { TrackChunkRecoveryResponse } from '../dto/chunks/recovery.dto.js';
import type { FinalizeTrackBody, FinalizeTrackResponse } from '../dto/tracks/finalize.dto.js';
import type { RegisterTrackBody, RegisterTrackResponse } from '../dto/tracks/register.dto.js';
import { getRequestPrincipal } from '../lib/request-principal.js';
import { createRecordingService, getRecordingService } from '../services/recordings.service.js';
import type { GetRecordingResponse } from '../dto/recordings/get.dto.js';
import type { GetProjectAssetsGraphResponse } from '../dto/recordings/project-assets.dto.js';
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
import { finalizeTrackCaptureService } from '../services/track-finalization.service.js';
import {
    completeTrackChunkService,
    getTrackChunkRecoveryService,
    initiateTrackChunkService,
} from '../services/track-chunk.service.js';
import { broadcastStudioRoomEvent } from '../websocket/studioWebsocket.js';
import { getProjectAssetsGraphService } from '../services/project-assets.service.js';
import { emitTelemetry } from '../lib/telemetry.js';

const LIVE_RECORDING_TRANSPORT = 'tus';

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

    app.get<{
        Params: { id: string }
    }>('/v1/recordings/:id/project-assets', { preHandler: authGuard }, async (req, res) => {
        const requesterId = (req as any).user?.id as string | undefined;
        if (!requesterId) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const result = await getProjectAssetsGraphService({ recordingId: id, requesterId });

        if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });

        return res.code(200).send(result.data as GetProjectAssetsGraphResponse);
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
        const principal = getRequestPrincipal(req);
        if (!principal) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const result = await getRecordingSessionService({ recordingId: id, principal });

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
        const principal = getRequestPrincipal(req);
        if (!principal) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const result = await startRecordingSessionService({ recordingId: id, principal });

        if (result.code !== 'ok') {
            if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
            if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
            return res.code(409).send({ code: 'invalid_transition', message: result.message });
        }

        emitTelemetry({
            logger: req.log,
            event: 'recording.session.started',
            message: 'Recording session started',
            recordingId: id,
            sessionId: id,
            participantId: result.data.session.hostParticipantId,
            actorKind: principal.kind,
            controlVersion: result.data.session.controlVersion,
        });

        // Studio room id equals recording id in this app
        broadcastStudioRoomEvent(id, { type: 'recording.started', roomId: id, session: result.data.session });

        return res.code(200).send(result.data);
    });

    app.post<{
        Params: { id: string }
    }>('/v1/recordings/:id/session/stop', { preHandler: authGuard }, async (req, res) => {
        const principal = getRequestPrincipal(req);
        if (!principal) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const result = await stopRecordingSessionService({ recordingId: id, principal });

        if (result.code !== 'ok') {
            if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
            if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
            return res.code(409).send({ code: 'invalid_transition', message: result.message });
        }

        emitTelemetry({
            logger: req.log,
            event: 'recording.session.stopped',
            message: 'Recording session stop requested',
            recordingId: id,
            sessionId: id,
            participantId: result.data.session.hostParticipantId,
            actorKind: principal.kind,
            controlVersion: result.data.session.controlVersion,
        });

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
        const principal = getRequestPrincipal(req);
        if (!principal) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const body = req.body;
        const result = await registerTrackIdentityService({ recordingId: id, principal, body });

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
        Params: { id: string; trackId: string };
        Body: FinalizeTrackBody;
    }>('/v1/recordings/:id/tracks/:trackId/finalize', { preHandler: authGuard }, async (req, res) => {
        const principal = getRequestPrincipal(req);
        if (!principal) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id, trackId } = req.params;
        const body = req.body;
        const result = await finalizeTrackCaptureService({
            recordingId: id,
            trackId,
            principal,
            body,
        });

        if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        if (result.code === 'invalid_track') {
            return res.code(422).send({ code: 'invalid_track', message: 'Track does not belong to this recording' });
        }
        if (result.code === 'invalid_final_seq') {
            return res.code(422).send({ code: 'invalid_final_seq', message: result.message });
        }

        return res.code(200).send(result.data as FinalizeTrackResponse);
    });

    app.get<{
        Params: { id: string; trackId: string };
    }>('/v1/recordings/:id/tracks/:trackId/chunks/recovery', { preHandler: authGuard }, async (req, res) => {
        const principal = getRequestPrincipal(req);
        if (!principal) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id, trackId } = req.params;
        const result = await getTrackChunkRecoveryService({ recordingId: id, trackId, principal });

        if (result.code !== 'ok') {
            if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
            if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
            if (result.code === 'invalid_track') {
                return res.code(422).send({ code: 'invalid_track', message: 'Track does not belong to this recording' });
            }
            return res.code(409).send({ code: result.code, message: 'Invalid chunk recovery state' });
        }

        return res.code(200).send(result.data as TrackChunkRecoveryResponse);
    });

    app.post<{
        Params: { id: string };
        Body: InitiateTrackChunkBody;
    }>('/v1/recordings/:id/chunks/initiate', { preHandler: authGuard }, async (req, res) => {
        const principal = getRequestPrincipal(req);
        if (!principal) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id } = req.params;
        const body = req.body;
        if (body.protocol !== LIVE_RECORDING_TRANSPORT) {
            return res.code(410).send({
                code: 'live_transport_tus_only',
                message: 'Live recording chunk transport is TUS-only. Use /v1/uploads/* for manual/import multipart workflows.',
            });
        }
        const result = await initiateTrackChunkService({ recordingId: id, principal, body });

        if (result.code === 'not_found') return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        if (result.code === 'forbidden') return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        if (result.code === 'invalid_track') {
            return res.code(422).send({ code: 'invalid_track', message: 'Track does not belong to this recording' });
        }
        if (result.code === 'invalid_protocol') {
            return res.code(422).send({ code: 'invalid_protocol', message: 'Unsupported chunk protocol' });
        }
        if (result.code === 'tus_not_uploaded_yet') {
            return res.code(409).send({ code: result.code, message: result.message, details: result.details });
        }
        if (result.code === 'tus_upload_orphaned') {
            return res.code(409).send({ code: result.code, message: result.message, details: result.details });
        }
        if (result.code === 'tus_storage_misconfigured') {
            return res.code(500).send({ code: result.code, message: result.message, details: result.details });
        }
        if (result.code === 'invalid_seq' || result.code === 'seq_integrity_error') {
            return res.code(409).send({ code: result.code, message: result.message, details: result.details });
        }

        return res.code(200).send(result.data as InitiateTrackChunkResponse);
    });

    app.post<{
        Params: { id: string; chunkId: string };
        Body: CompleteTrackChunkBody;
    }>('/v1/recordings/:id/chunks/:chunkId/complete', { preHandler: authGuard }, async (req, res) => {
        const principal = getRequestPrincipal(req);
        if (!principal) {
            return res.code(401).send({ error: 'Unauthorized', message: 'User not authenticated, Login required' });
        }

        const { id, chunkId } = req.params;
        const body = req.body;
        if (body.protocol !== LIVE_RECORDING_TRANSPORT) {
            return res.code(410).send({
                code: 'live_transport_tus_only',
                message: 'Live recording chunk transport is TUS-only. Use /v1/uploads/* for manual/import multipart workflows.',
            });
        }
        const result = await completeTrackChunkService({
            recordingId: id,
            chunkId,
            principal,
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
        if (result.code === 'tus_not_uploaded_yet') {
            return res.code(409).send({ code: result.code, message: result.message, details: result.details });
        }
        if (result.code === 'tus_upload_orphaned') {
            return res.code(409).send({ code: result.code, message: result.message, details: result.details });
        }
        if (result.code === 'tus_storage_misconfigured') {
            return res.code(500).send({ code: result.code, message: result.message, details: result.details });
        }
        if (result.code === 'invalid_seq' || result.code === 'seq_integrity_error') {
            return res.code(409).send({ code: result.code, message: result.message, details: result.details });
        }

        return res.code(200).send(result.data as CompleteTrackChunkResponse);
    });

    app.post<{
        Params: { id: string };
        Body: { trackId: string; seq: number; bytesExpected?: number };
    }>('/v1/recordings/:id/chunks/multipart/initiate', { preHandler: authGuard }, async (req, res) => {
        return res.code(410).send({
            code: 'live_multipart_deprecated',
            message: 'Multipart chunk transport is deprecated for live recordings. Use TUS chunk routes for studio sessions.',
        });
    });

    app.post<{
        Params: { id: string; chunkId: string };
        Body: Omit<CompleteTrackChunkBody, 'protocol'>;
    }>('/v1/recordings/:id/chunks/multipart/:chunkId/complete', { preHandler: authGuard }, async (req, res) => {
        return res.code(410).send({
            code: 'live_multipart_deprecated',
            message: 'Multipart chunk transport is deprecated for live recordings. Use TUS chunk routes for studio sessions.',
        });
    });
}
