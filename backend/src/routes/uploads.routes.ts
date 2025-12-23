import type { FastifyInstance } from 'fastify';
import { initiateUploadService, completeUploadService, completeMultipartUploadService } from '../services/uploads.service.js';
import type { InitiateUploadBody, InitiateUploadResponse } from '../dto/uploads/initiate.dto.js';
import { CompleteUploadResponse } from '../dto/uploads/complete.dto.js';

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

export default async function uploadsRoutes(app: FastifyInstance) {
  app.post('/v1/uploads/initiate', async (req, res) => {
    const where = 'uploads.routes:initiate';
    try {
      const body = req.body as InitiateUploadBody;
      const result: InitiateUploadResponse = await initiateUploadService(body);
      return res.code(200).send(result);
    } catch (err: any) {
      return sendError(res, err, where);
    }
  });

  app.post('/v1/uploads/:id/complete', async (req, res) => {
    const where = 'uploads.routes:complete';
    try {
      const { id } = req.params as { id: string };
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
        return res.code (200).send(response);
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
