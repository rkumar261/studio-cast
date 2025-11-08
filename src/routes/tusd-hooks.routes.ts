import type { FastifyInstance } from 'fastify';
import { saveTusMapping } from '../repositories/upload.repo.js';

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

      return res.code(200).send({ Action: 'continue' });
    }

    // For all other hooks: continue
    return res.code(200).send({ Action: 'continue' });
  });
}