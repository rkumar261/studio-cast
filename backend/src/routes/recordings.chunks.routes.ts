import type { FastifyInstance } from 'fastify';
import type { CompleteTrackChunkBody, CompleteTrackChunkResponse } from '../dto/chunks/complete.dto.js';
import type { InitiateTrackChunkBody, InitiateTrackChunkResponse } from '../dto/chunks/initiate.dto.js';
import type { TrackChunkRecoveryResponse } from '../dto/chunks/recovery.dto.js';
import type { FinalizeTrackBody, FinalizeTrackResponse } from '../dto/tracks/finalize.dto.js';
import type { RegisterTrackBody, RegisterTrackResponse } from '../dto/tracks/register.dto.js';
import { authGuard } from '../middlewares/auth.guard.js';
import { requirePrincipal } from './recordings.route-helpers.js';
import { registerTrackIdentityService } from '../services/track-registration.service.js';
import { finalizeTrackCaptureService } from '../services/track-finalization.service.js';
import {
  completeTrackChunkService,
  getTrackChunkRecoveryService,
  initiateTrackChunkService,
} from '../services/track-chunk.service.js';

const LIVE_RECORDING_TRANSPORT = 'presigned_url';

export default async function recordingChunksRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string }; Body: RegisterTrackBody }>(
    '/v1/recordings/:id/tracks/register',
    { preHandler: authGuard },
    async (req, res) => {
      const principal = requirePrincipal(req, res);
      if (!principal) return;

      const result = await registerTrackIdentityService({
        recordingId: req.params.id,
        principal,
        body: req.body,
      });

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
    }
  );

  app.post<{ Params: { id: string; trackId: string }; Body: FinalizeTrackBody }>(
    '/v1/recordings/:id/tracks/:trackId/finalize',
    { preHandler: authGuard },
    async (req, res) => {
      const principal = requirePrincipal(req, res);
      if (!principal) return;

      const result = await finalizeTrackCaptureService({
        recordingId: req.params.id,
        trackId: req.params.trackId,
        principal,
        body: req.body,
      });

      if (result.code === 'not_found') {
        return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
      }
      if (result.code === 'forbidden') {
        return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
      }
      if (result.code === 'invalid_track') {
        return res.code(422).send({ code: 'invalid_track', message: 'Track does not belong to this recording' });
      }
      if (result.code === 'invalid_final_seq') {
        return res.code(422).send({ code: 'invalid_final_seq', message: result.message });
      }

      return res.code(200).send(result.data as FinalizeTrackResponse);
    }
  );

  app.get<{ Params: { id: string; trackId: string } }>(
    '/v1/recordings/:id/tracks/:trackId/chunks/recovery',
    { preHandler: authGuard },
    async (req, res) => {
      const principal = requirePrincipal(req, res);
      if (!principal) return;

      const result = await getTrackChunkRecoveryService({
        recordingId: req.params.id,
        trackId: req.params.trackId,
        principal,
      });

      if (result.code !== 'ok') {
        if (result.code === 'not_found') {
          return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        }
        if (result.code === 'forbidden') {
          return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        }
        if (result.code === 'invalid_track') {
          return res.code(422).send({ code: 'invalid_track', message: 'Track does not belong to this recording' });
        }
        return res.code(409).send({ code: result.code, message: 'Invalid chunk recovery state' });
      }

      return res.code(200).send(result.data as TrackChunkRecoveryResponse);
    }
  );

  app.post<{ Params: { id: string }; Body: InitiateTrackChunkBody }>(
    '/v1/recordings/:id/chunks/initiate',
    { preHandler: authGuard },
    async (req, res) => {
      const principal = requirePrincipal(req, res);
      if (!principal) return;

      if (req.body.protocol !== LIVE_RECORDING_TRANSPORT) {
        return res.code(410).send({
          code: 'live_transport_protocol_mismatch',
          message:
            'Live recording chunk transport requires presigned_url protocol. Use /v1/uploads/* for manual/import multipart workflows.',
        });
      }

      const result = await initiateTrackChunkService({
        recordingId: req.params.id,
        principal,
        body: req.body,
      });

      if (result.code === 'not_found') {
        return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
      }
      if (result.code === 'forbidden') {
        return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
      }
      if (result.code === 'invalid_track') {
        return res.code(422).send({ code: 'invalid_track', message: 'Track does not belong to this recording' });
      }
      if (result.code === 'invalid_protocol') {
        return res.code(422).send({ code: 'invalid_protocol', message: 'Unsupported chunk protocol' });
      }
      if (result.code === 'invalid_seq' || result.code === 'seq_integrity_error') {
        return res.code(409).send({ code: result.code, message: result.message, details: result.details });
      }

      return res.code(200).send(result.data as InitiateTrackChunkResponse);
    }
  );

  app.post<{ Params: { id: string; chunkId: string }; Body: CompleteTrackChunkBody }>(
    '/v1/recordings/:id/chunks/:chunkId/complete',
    { preHandler: authGuard },
    async (req, res) => {
      const principal = requirePrincipal(req, res);
      if (!principal) return;

      if (req.body.protocol !== LIVE_RECORDING_TRANSPORT) {
        return res.code(410).send({
          code: 'live_transport_protocol_mismatch',
          message:
            'Live recording chunk transport requires presigned_url protocol. Use /v1/uploads/* for manual/import multipart workflows.',
        });
      }

      const result = await completeTrackChunkService({
        recordingId: req.params.id,
        chunkId: req.params.chunkId,
        principal,
        body: req.body,
      });

      if (result.code === 'not_found') {
        return res.code(404).send({ code: 'not_found', message: 'Chunk or recording not found' });
      }
      if (result.code === 'forbidden') {
        return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
      }
      if (result.code === 'invalid_track') {
        return res.code(422).send({ code: 'invalid_track', message: 'Chunk track does not belong to this recording' });
      }
      if (result.code === 'invalid_protocol') {
        return res.code(422).send({ code: 'invalid_protocol', message: 'Unsupported chunk protocol' });
      }
      if (result.code === 'invalid_seq' || result.code === 'seq_integrity_error') {
        return res.code(409).send({ code: result.code, message: result.message, details: result.details });
      }

      return res.code(200).send(result.data as CompleteTrackChunkResponse);
    }
  );

  app.post<{ Params: { id: string }; Body: { trackId: string; seq: number; bytesExpected?: number } }>(
    '/v1/recordings/:id/chunks/multipart/initiate',
    { preHandler: authGuard },
    async (_req, res) => {
      return res.code(410).send({
        code: 'live_multipart_deprecated',
        message: 'Multipart chunk transport is deprecated for live recordings. Use TUS chunk routes for studio sessions.',
      });
    }
  );

  app.post<{ Params: { id: string; chunkId: string }; Body: Omit<CompleteTrackChunkBody, 'protocol'> }>(
    '/v1/recordings/:id/chunks/multipart/:chunkId/complete',
    { preHandler: authGuard },
    async (_req, res) => {
      return res.code(410).send({
        code: 'live_multipart_deprecated',
        message: 'Multipart chunk transport is deprecated for live recordings. Use TUS chunk routes for studio sessions.',
      });
    }
  );
}
