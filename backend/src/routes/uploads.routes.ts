import type { FastifyInstance } from 'fastify';
import { initiateUploadService, completeUploadService, completeMultipartUploadService } from '../services/uploads.service.js';
import type { InitiateUploadBody, InitiateUploadResponse } from '../dto/uploads/initiate.dto.js';
import { CompleteUploadResponse } from '../dto/uploads/complete.dto.js';
import { authGuard } from '../middlewares/auth.guard.js';
import { getRequestPrincipal, type RequestPrincipal } from '../lib/request-principal.js';
import { prisma } from '../lib/prisma.js';
import { getUploadWithTrack } from '../repositories/upload.repo.js';

type ErrorPayload = {
  code: string;
  message: string;
  where: string;
  details?: unknown;
};

function sendError(res: any, err: any, fallbackWhere: string) {
  const isAppErr = err && typeof err === 'object' && 'code' in err && 'where' in err;
  const status = isAppErr ? (err.status ?? 500) : 500;
  const payload: ErrorPayload = isAppErr
    ? { code: err.code, message: err.message, where: err.where, details: err.details }
    : { code: 'unexpected', message: String(err?.message || err || 'Unexpected error'), where: fallbackWhere };

  // Log once here with full context
  res.log?.error?.(payload);
  return res.code(status).send(payload);
}

type ScopeResult =
  | { code: 'ok' }
  | { code: 'not_found' }
  | { code: 'forbidden'; message: string };

async function checkRecordingScope(
  principal: RequestPrincipal,
  recordingId: string,
  participantId?: string
): Promise<ScopeResult> {
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    select: { id: true, userId: true },
  });
  if (!recording) return { code: 'not_found' };

  if (principal.kind === 'user') {
    if (recording.userId && recording.userId !== principal.userId) {
      return { code: 'forbidden', message: 'Not allowed for this recording' };
    }
    return { code: 'ok' };
  }

  if (principal.recordingId !== recordingId) {
    return { code: 'forbidden', message: 'Guest token is out of recording scope' };
  }
  if (participantId && principal.participantId !== participantId) {
    return { code: 'forbidden', message: 'Guest token is out of participant scope' };
  }

  return { code: 'ok' };
}

export default async function uploadsRoutes(app: FastifyInstance) {
  app.post('/v1/uploads/initiate', { preHandler: authGuard }, async (req, res) => {
    const where = 'uploads.routes:initiate';
    try {
      const principal = getRequestPrincipal(req);
      if (!principal) {
        return res.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      }

      const body = req.body as InitiateUploadBody;
      const scope = await checkRecordingScope(principal, body.recordingId, body.participantId);
      if (scope.code === 'not_found') {
        return res.code(404).send({ code: 'not_found', message: 'Recording not found' });
      }
      if (scope.code === 'forbidden') {
        return res.code(403).send({ code: 'forbidden', message: scope.message });
      }

      const result: InitiateUploadResponse = await initiateUploadService(body);
      return res.code(200).send(result);
    } catch (err: any) {
      return sendError(res, err, where);
    }
  });

  app.post('/v1/uploads/:id/complete', { preHandler: authGuard }, async (req, res) => {
    const where = 'uploads.routes:complete';
    try {
      const principal = getRequestPrincipal(req);
      if (!principal) {
        return res.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      }

      const { id } = req.params as { id: string };
      const upload = await getUploadWithTrack(id);
      if (!upload || !upload.track) {
        return res.code(404).send({ code: 'not_found', message: 'Upload not found' });
      }

      const scope = await checkRecordingScope(principal, upload.track.recording_id, upload.track.participant_id);
      if (scope.code === 'forbidden') {
        return res.code(403).send({ code: 'forbidden', message: scope.message });
      }

      const body = (req.body as any) || {};

      // Branch by explicit protocol in the request body
      if (body.protocol === 'multipart') {
        // Expect: { protocol:'multipart', parts:[{partNumber, etag}], totalBytes?: number }
        const { parts, totalBytes } = body;
        if (!Array.isArray(parts) || parts.length === 0) {
          return res.code(422).send({
            code: 'bad_request',
            message: 'parts[] is required for multipart completion',
            details: { partsLen: parts?.length },
          });
        }

        const data = await completeMultipartUploadService({
          uploadId: id,
          parts,
          totalBytes,
        });

        const response: CompleteUploadResponse = data as any;
        return res.code(200).send(response);
      }

      // Default: legacy TUS completion (your existing behavior)
      // Expect: { bytes?: number, tusUrl?: string }
      const { bytes, tusUrl } = body;
      const data = await completeUploadService(id, bytes, tusUrl);
      const response: CompleteUploadResponse = data as any;
      return res.code(200).send(response);

    } catch (err: any) {
      return sendError(res, err, where);
    }
  });
}
