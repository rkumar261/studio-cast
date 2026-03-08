import type { FastifyInstance } from 'fastify';
import { saveTusMapping } from '../repositories/upload.repo.js';
import { markTrackChunkFailed, setTrackChunkTusRef } from '../repositories/track-chunk.repo.js';

function normalizeTusEndpoint(input?: string) {
  const raw = (input ?? '').trim();
  if (!raw) return 'http://localhost:8080/tus/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function tusResourceUrlFromId(tusId?: string) {
  if (!tusId) return undefined;
  return `${normalizeTusEndpoint(process.env.UPLOAD_TUS_BASE_URL)}${tusId}`;
}

function parseMaybeNumber(input: unknown): number | undefined {
  if (input == null) return undefined;
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

/**
 * tusd HTTP hooks handler.
 * - Always reply quickly with { Action: 'continue' } for pre-create (so client gets 201 + Location).
 * - In post-create, optionally persist { uploadId, tusId } if you have a repo helper available.
 *
 * Supports both body shapes:
 *  A) Modern: { Upload: { ID, MetaData: { ... } }, ... } with "Hook-Name" header
 *  B) Legacy: { Type: 'pre-create'|'post-create', MetaData: { ... }, ... }
 */
export default async function tusdHooksRoutes(app: FastifyInstance) {
  app.post('/tusd/hooks', async (req, res) => {
    const hookHeader = String(req.headers['hook-name'] || '');
    const body = (req.body ?? {}) as any;

    // Normalize hook name
    const hookName =
      hookHeader ||
      (typeof body?.Type === 'string' ? body.Type : '');

    // Helper to extract metadata safely (decoded map in modern tusd)
    const meta: Record<string, string> = body?.Upload?.MetaData
      ?? body?.MetaData
      ?? {};

    // Pre-create: validate minimally and CONTINUE (never block)
    if (hookName === 'pre-create') {
      return res.code(200).send({ Action: 'continue' });
    }

    // Post-create: map tusId <-> your uploadId (optional but recommended)
    if (hookName === 'post-create') {
      const tusId: string | undefined = body?.Upload?.ID;
      const uploadId: string | undefined = meta['upload-id'] ?? meta['upload_id'];
      const chunkId: string | undefined = meta['chunk-id'] ?? meta['chunk_id'];
      const bytesExpected = parseMaybeNumber(body?.Upload?.Size ?? body?.Size);

      if (tusId && uploadId) {
        try {
          if (typeof saveTusMapping === 'function') {
            await saveTusMapping({ uploadId, tusId });
            req.log.info({ uploadId, tusId }, 'Saved tus mapping');
          } else {
            req.log.warn({ uploadId, tusId }, 'saveTusMapping not available; skipping map persist');
          }
        } catch (e) {
          req.log.error({ err: e, tusId, uploadId }, 'saveTusMapping failed');
        }
      } else {
        req.log.warn({ tusId, meta }, 'post-create missing tusId or upload-id');
      }

      if (tusId && chunkId) {
        try {
          await setTrackChunkTusRef({
            chunkId,
            tusId,
            tusResourceUrl: tusResourceUrlFromId(tusId),
            tusUploadState: 'uploading',
            bytesExpected,
          });
          req.log.info({ chunkId, tusId }, 'Saved chunk tus mapping');
        } catch (e) {
          req.log.error({ err: e, chunkId, tusId }, 'setTrackChunkTusRef failed');
        }
      }

      return res.code(200).send({ Action: 'continue' });
    }

    if (hookName === 'post-receive') {
      const tusId: string | undefined = body?.Upload?.ID;
      const chunkId: string | undefined = meta['chunk-id'] ?? meta['chunk_id'];
      const bytesExpected = parseMaybeNumber(body?.Upload?.Size ?? body?.Size);
      const bytesReceived = parseMaybeNumber(body?.Upload?.Offset ?? body?.Offset);
      if (tusId && chunkId) {
        try {
          await setTrackChunkTusRef({
            chunkId,
            tusId,
            tusResourceUrl: tusResourceUrlFromId(tusId),
            tusUploadState: 'uploading',
            bytesExpected,
            bytesReceived,
          });
        } catch (e) {
          req.log.error({ err: e, chunkId, tusId }, 'post-receive setTrackChunkTusRef failed');
        }
      }
      return res.code(200).send({ Action: 'continue' });
    }

    if (hookName === 'post-terminate') {
      const chunkId: string | undefined = meta['chunk-id'] ?? meta['chunk_id'];
      if (chunkId) {
        try {
          await markTrackChunkFailed({
            chunkId,
            reason: 'tus_upload_terminated',
            tusUploadState: 'terminated',
          });
        } catch (e) {
          req.log.error({ err: e, chunkId }, 'post-terminate markTrackChunkFailed failed');
        }
      }
      return res.code(200).send({ Action: 'continue' });
    }

    // For all other hooks: continue
    return res.code(200).send({ Action: 'continue' });
  });
}
