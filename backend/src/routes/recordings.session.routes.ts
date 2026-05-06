import type { FastifyInstance } from 'fastify';
import { authGuard } from '../middlewares/auth.guard.js';
import { requirePrincipal, emitGuestAccessBlocked } from './recordings.route-helpers.js';
import {
  getRecordingSessionService,
  startRecordingSessionService,
  stopRecordingSessionService,
} from '../services/recording-session.service.js';
import { emitTelemetry } from '../lib/telemetry.js';
import { broadcastStudioRoomEvent } from '../websocket/studioWebsocket.js';

export default async function recordingSessionRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/v1/recordings/:id/session',
    { preHandler: authGuard },
    async (req, res) => {
      const principal = requirePrincipal(req, res);
      if (!principal) return;

      const result = await getRecordingSessionService({ recordingId: req.params.id, principal });

      if (result.code !== 'ok') {
        if (result.code === 'not_found') {
          return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        }
        return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
      }

      return res.code(200).send(result.data);
    }
  );

  app.post<{ Params: { id: string } }>(
    '/v1/recordings/:id/session/start',
    { preHandler: authGuard },
    async (req, res) => {
      const principal = requirePrincipal(req, res);
      if (!principal) return;

      const { id } = req.params;
      const result = await startRecordingSessionService({ recordingId: id, principal });

      if (result.code !== 'ok') {
        if (result.code === 'not_found') {
          return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        }
        if (result.code === 'forbidden') {
          if (principal.kind === 'guest') {
            emitGuestAccessBlocked(req, {
              recordingId: id,
              participantId: principal.participantId,
              action: 'session_start',
              reason: 'host_control_required',
            });
          }
          return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        }
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

      broadcastStudioRoomEvent(id, {
        type: 'recording.started',
        roomId: id,
        session: result.data.session,
      });

      return res.code(200).send(result.data);
    }
  );

  app.post<{ Params: { id: string } }>(
    '/v1/recordings/:id/session/stop',
    { preHandler: authGuard },
    async (req, res) => {
      const principal = requirePrincipal(req, res);
      if (!principal) return;

      const { id } = req.params;
      const result = await stopRecordingSessionService({ recordingId: id, principal });

      if (result.code !== 'ok') {
        if (result.code === 'not_found') {
          return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
        }
        if (result.code === 'forbidden') {
          if (principal.kind === 'guest') {
            emitGuestAccessBlocked(req, {
              recordingId: id,
              participantId: principal.participantId,
              action: 'session_stop',
              reason: 'host_control_required',
            });
          }
          return res.code(403).send({ code: 'forbidden', message: 'Not allowed' });
        }
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

      broadcastStudioRoomEvent(id, {
        type: 'recording.stop_requested',
        roomId: id,
        session: result.data.session,
      });

      return res.code(200).send(result.data);
    }
  );
}
