import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';

import {
  createTrackAndUpload,
  getUploadWithTrack,
  markUploadCompletedAndSetRawKey,
  saveMultipartPlan
} from '../repositories/upload.repo.js';
import { createJob } from '../repositories/job.repo.js';

import type { InitiateUploadBody, InitiateUploadResponse } from '../dto/uploads/initiate.dto.js';
import { getR2Client, R2_BUCKET } from '../lib/r2.js';
import { CreateMultipartUploadCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';


/** Error & env utilities */

class AppError extends Error {
  code: string;
  status: number;
  where: string;
  details?: unknown;
  constructor(opts: { code: string; message: string; status?: number; where: string; details?: unknown }) {
    super(opts.message);
    this.code = opts.code;
    this.status = opts.status ?? 500;
    this.where = opts.where;
    this.details = opts.details;
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new AppError({
      code: 'env_missing',
      where: `uploads.service:${name}`,
      status: 500,
      message: `Environment variable ${name} is required but missing`,
      details: { name },
    });
  }
  return v;
}

/** Read & validate critical envs once at module load (fail fast). */
const TUSD_DIR = requireEnv('TUSD_UPLOAD_DIR');
const MEDIA_ROOT = requireEnv('MEDIA_ROOT');

// Normalize TUS base (avoid double slashes)
const RAW_TUS_BASE = requireEnv('UPLOAD_TUS_BASE_URL');
const TUS_BASE = RAW_TUS_BASE.replace(/\/+$/, '');

const MP_BASE = requireEnv('UPLOAD_MULTIPART_BASE_URL'); // placeholder for multipart

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}
async function pathExists(p: string) {
  try { await fs.stat(p); return true; } catch { return false; }
}

/** Extract the tus resource id from a full URL like .../tus/<id>[?...] */
function parseTusIdFromUrl(u?: string): string | null {
  if (!u) return null;
  try {
    const last = u.trim().split('?')[0].replace(/\/+$/, '').split('/').pop();
    return last || null;
  } catch {
    return null;
  }
}

/** Direct lookup by tusd id (data file has no extension, metadata is <id>.info) */
async function findTusDataById(tusId: string): Promise<string | null> {
  const dataPath = path.join(TUSD_DIR, tusId);
  return (await pathExists(dataPath)) ? dataPath : null;
}

/**
 * Fallback: scan .info files, decode metadata and match our "upload-id".
 * (tusd stores base64 values under MetaData or metadata, depending on build)
 */
async function findTusDataByUploadId(uploadId: string): Promise<string | null> {
  const entries = await fs.readdir(TUSD_DIR, { withFileTypes: true });

  // helper: decode only if it *looks* like base64
  const maybeDecode = (v?: string) => {
    if (!v) return '';
    const s = String(v).trim();
    // base64 heuristic: only b64 chars and length multiple of 4
    const looksB64 = /^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0;
    if (!looksB64) return s; // plain value
    try { return Buffer.from(s, 'base64').toString('utf8'); }
    catch { return s; }
  };

  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.info')) continue;

    const infoPath = path.join(TUSD_DIR, e.name);
    try {
      const raw = await fs.readFile(infoPath, 'utf8');
      const info = JSON.parse(raw) as any;

      const md: Record<string, string> = info.MetaData ?? info.metadata ?? {};
      const v = md['upload-id'] ?? md['upload_id'];
      const value = maybeDecode(v);

      if (value === uploadId) {
        const stem = e.name.replace(/\.info$/, '');
        const dataPath = path.join(TUSD_DIR, stem);
        if (await pathExists(dataPath)) return dataPath;
      }
    } catch {
      // ignore malformed or half-written .info
    }
  }

  return null;
}

/** Try to resolve tusId from DB mapping if the repo helper exists (dynamic import). */
async function tryGetTusIdFromMapping(uploadId: string): Promise<string | null> {
  try {
    const repo = await import('../repositories/upload.repo.js');
    const fn: any = (repo as any).getTusIdByUploadId;
    if (typeof fn === 'function') {
      const tusId = await fn(uploadId);
      return tusId || null;
    }
  } catch {
    // mapping helper not available, ignore
  }
  return null;
}

/** Services */

export async function initiateUploadService(
  body: InitiateUploadBody
): Promise<InitiateUploadResponse> {
  const where = 'uploads.service:initiate';
  try {
    if (!body?.recordingId || !body?.participantId || !body?.kind || !body?.protocol) {
      throw new AppError({
        code: 'bad_request',
        where,
        status: 400,
        message: 'Missing required fields: recordingId, participantId, kind, protocol',
        details: { body },
      });
    }

    const track = await createTrackAndUpload(
      body.recordingId,
      body.participantId,
      body.kind,
      body.protocol
    ).catch((e: any) => {
      throw new AppError({
        code: 'db_create_failed',
        where,
        message: 'Failed to create track + upload in database',
        details: { error: String(e) },
      });
    });

    const upload = track.upload?.[0];
    if (!upload) {
      throw new AppError({
        code: 'invalid_state',
        where,
        status: 500,
        message: 'Track created without associated upload row',
        details: { trackId: track?.id },
      });
    }

    if (body.protocol === 'multipart') {

      const filename = (body as any).filename ?? `${upload.id}.bin`;
      const totalSize = Number((body as any).size ?? 0);
      const contentType = (body as any).contentType ?? 'application/octet-stream';
      const requestedPartSize = Number((body as any).partSize ?? 0);

      if (!totalSize || Number.isNaN(totalSize)) {
        throw new AppError({
          code: 'bad_request',
          where,
          status: 422,
          message: 'size is required for multipart',
          details: { size: (body as any).size }
        });
      }

      // S3-compitable minimum is 5 Mib
      const MIN_PART = 5 * 1024 * 1024;
      const DEFAULT_PART = 8 * 1024 * 1024;
      const partSize = Math.max(requestedPartSize || DEFAULT_PART, MIN_PART);
      const totalParts = Math.ceil(totalSize / partSize);

      // Create Multipart on
      const r2 = getR2Client();
      const objectKey = `recordings/${track.recording_id}/tracks/${upload.id}.raw`;

      const created = await r2.send(new CreateMultipartUploadCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
        ContentType: contentType,
        Metadata: {
          reordingId: String(track.recording_id),
          participantId: String(track.participant_id),
          trackId: String(track.id),
          uploadId: String(upload.id),
          filename
        }
      }));

      const multipartId = created.UploadId;

      if (!multipartId) {
        throw new AppError({
          code: 'r2_create_failed',
          where,
          message: 'Failed to create multipart upload on R2'
        });
      }

      // Presign each part URL (15 min expiry)
      const presignedUrls: string[] = [];
      const presignMeta: { partNumber: number; size: number }[] = [];

      for (let i = 0; i < totalParts; i++) {
        const partNumber = i + 1;
        const cmd = new UploadPartCommand({
          Bucket: R2_BUCKET,
          Key: objectKey,
          UploadId: multipartId,
          PartNumber: partNumber
        });

        const url = await getSignedUrl(r2, cmd, { expiresIn: 60 * 15 });
        presignedUrls.push(url);

        const start = i * partSize;
        const end = Math.min((i + 1) * partSize, totalSize);
        presignMeta.push({ partNumber, size: end - start });
      }

      await saveMultipartPlan({
        uploadId: upload.id,
        bucket: R2_BUCKET,
        objectKey,
        multipartId,
        partSize,
        expectedSize: totalSize,
        presignMeta
      });

      const response: InitiateUploadResponse = {
        upload: {
          id: upload.id,
          trackId: track.id,
          protocol: 'multipart',
          state: 'in_progress'
        },
        presignedUrls,
        partSize
      };

      return response;
    }

    const response: InitiateUploadResponse = {
      upload: {
        id: upload.id,
        trackId: track.id,
        protocol: upload.protocol as 'tus' | 'multipart',
        state: upload.state as 'in_progress',
      },
      // ...(body.protocol === 'tus'
      //   ? { tusEndpoint: `${TUS_BASE}/` }                                  // normalized
      //   : { presignedUrls: [`${MP_BASE.replace(/\/+$/, '')}/${upload.id}/part1`] }),
      tusEndpoint: `${TUS_BASE}/`,
    };

    return response;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError({
      code: 'unexpected',
      where,
      message: 'Unexpected error during upload initiation',
      details: { error: String(err) },
    });
  }
}

/**
 * Complete: move file from TUSD_DIR into MEDIA_ROOT, mark DB completed, enqueue transcode.
 * Accepts expectedBytes (optional) and tusUrl (optional) for direct tus id resolution.
 */
export async function completeUploadService(
  uploadId: string,
  expectedBytes?: number,
  tusUrl?: string
): Promise<{ bytes: number; storageKeyRaw: string; already?: boolean }> {
  const where = 'uploads.service:complete';

  try {
    if (!uploadId) {
      throw new AppError({
        code: 'bad_request',
        where,
        status: 400,
        message: 'uploadId is required',
      });
    }

    const upload = await getUploadWithTrack(uploadId).catch((e: any) => {
      throw new AppError({
        code: 'db_read_failed',
        where,
        message: 'Failed to lookup upload by id',
        details: { uploadId, error: String(e) },
      });
    });

    if (!upload) {
      throw new AppError({
        code: 'not_found',
        where,
        status: 404,
        message: 'Upload not found',
        details: { uploadId },
      });
    }

    const track = upload.track;
    if (!track) {
      throw new AppError({
        code: 'invalid_state',
        where,
        status: 409,
        message: 'Upload has no associated track',
        details: { uploadId },
      });
    }

    // Idempotent path
    if (upload.state === 'completed' && track.storage_key_raw) {
      return { bytes: 0, storageKeyRaw: track.storage_key_raw, already: true };
    }

    // ── Locate source file in TUSD_DIR ─────────────────────────────────────
    // Priority: tusUrl → DB mapping (if available) → legacy .info scan
    let src: string | null = null;
    let tusId = parseTusIdFromUrl(tusUrl || undefined);

    if (!tusId) {
      tusId = await tryGetTusIdFromMapping(uploadId); // silently ignores if helper absent
    }

    if (tusId) {
      src = await findTusDataById(tusId);
    }

    if (!src) {
      // Legacy fallback: scan .info for upload-id
      src = await findTusDataByUploadId(uploadId);
      if (!src) {
        throw new AppError({
          code: 'tusd_not_found',
          where,
          status: 404,
          message: 'Could not locate uploaded data in tusd storage',
          details: { uploadId, tusId, TUSD_DIR },
        });
      }
    }

    // ── Validate size if provided ──────────────────────────────────────────
    const st = await fs.stat(src);
    const got = Number(st.size);
    const exp = expectedBytes != null ? Number(expectedBytes) : undefined;
    if (typeof exp === 'number' && !Number.isNaN(exp) && got !== exp) {
      throw new AppError({
        code: 'size_mismatch',
        where,
        status: 422,
        message: 'Uploaded size does not match expectedBytes',
        details: { got, expected: exp, src },
      });
    }

    // ── Build destination and move ─────────────────────────────────────────
    const relKey = path.join(
      'recordings',
      String(track.recording_id),
      'tracks',
      String(track.id),
      'raw',
      `${uploadId}.bin`
    );
    const dest = path.join(MEDIA_ROOT, relKey);

    await ensureDir(path.dirname(dest)).catch((e: any) => {
      throw new AppError({
        code: 'fs_mkdir_failed',
        where,
        message: 'Failed to create destination directory',
        details: { dir: path.dirname(dest), error: String(e) },
      });
    });

    // rename with fallback to copy+unlink (handles cross-device/permission quirks)
    try {
      await fs.rename(src, dest);
    } catch (e1: any) {
      try {
        await fs.copyFile(src, dest);
        await fs.unlink(src);
      } catch (e2: any) {
        throw new AppError({
          code: 'fs_move_failed',
          where,
          message: 'Failed to move uploaded data (rename/copy)',
          details: { src, dest, error: String(e2 ?? e1) },
        });
      }
    }

    // Best-effort: remove sidecar .info
    try {
      const infoPath = path.join(TUSD_DIR, path.basename(src) + '.info');
      if (fssync.existsSync(infoPath)) {
        await fs.unlink(infoPath).catch(() => { });
      }
    } catch {
      // ignore
    }

    // ── Update DB state and enqueue job ────────────────────────────────────
    const result = await markUploadCompletedAndSetRawKey(uploadId, relKey).catch((e: any) => {
      throw new AppError({
        code: 'db_update_failed',
        where,
        message: 'Failed to mark upload completed and set storage key',
        details: { uploadId, relKey, error: String(e) },
      });
    });

    if ((result as any).code && (result as any).code !== 'ok') {
      throw new AppError({
        code: (result as any).code ?? 'db_update_failed',
        where,
        status: 409,
        message: 'Repository refused completion state change',
        details: { result },
      });
    }

    await createJob(track.recording_id, 'transcode', { trackId: track.id }).catch((e: any) => {
      throw new AppError({
        code: 'job_enqueue_failed',
        where,
        message: 'Failed to enqueue transcode job',
        details: { recordingId: track.recording_id, trackId: track.id, error: String(e) },
      });
    });

    return { bytes: got, storageKeyRaw: relKey };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError({
      code: 'unexpected',
      where,
      message: 'Unexpected error during upload completion',
      details: { uploadId, error: String(err) },
    });
  }
}

// NEW: complete a multipart upload on R2
export async function completeMultipartUploadService(input: {
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
  totalBytes?: number;
}): Promise<{ bytes: number; storageKeyRaw: string; already?: boolean }> {
  const where = 'uploads.service:completeMultipart';

  try {
    const { uploadId, parts, totalBytes } = input;
    if (!uploadId || !Array.isArray(parts) || parts.length === 0) {
      throw new AppError({
        code: 'bad_request',
        where,
        status: 422,
        message: 'uploadId and parts[] are required',
        details: { uploadId, partsLen: parts?.length }
      });
    }

    const upload = await getUploadWithTrack(uploadId).catch((e: any) => {
      throw new AppError({
        code: 'db_read_failed',
        where,
        message: 'Failed to lookup upload by id',
        details: { uploadId, error: String(e) },
      });
    });

    if (!upload || !upload.track) {
      throw new AppError({
        code: 'not_found',
        where,
        status: 404,
        message: 'Upload/Track not found',
        details: { uploadId },
      });
    }
    const track = upload.track;

    // Idempotent: if we already completed and have a raw key, return ok
    if (upload.state === 'completed' && track.storage_key_raw) {
      return { bytes: Number(upload.expected_size ?? 0), storageKeyRaw: track.storage_key_raw, already: true };
    }

    // Sanity checks for multipart fields we saved at initiate
    const bucket = upload.storage_bucket;
    const objectKey = upload.object_key;
    const multipartId = upload.multipart_id;
    if (!bucket || !objectKey || !multipartId) {
      throw new AppError({
        code: 'invalid_state',
        where,
        status: 409,
        message: 'Multipart metadata missing on upload row',
        details: { bucket, objectKey, multipartId }
      });
    }

    // Complete on R2
    const r2 = getR2Client();
    const { CompleteMultipartUploadCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');

    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    await r2.send(new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: objectKey,
      UploadId: multipartId,
      MultipartUpload: { Parts: sorted.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) }
    }));

    // Optional: verify size
    try {
      const head: any = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
      const bytes = Number(head?.ContentLength ?? 0);
      // Move DB to completed and set track.storage_key_raw to the object key
      const result = await markUploadCompletedAndSetRawKey(uploadId, objectKey);
      if ((result as any).code && (result as any).code !== 'ok') {
        throw new AppError({
          code: (result as any).code ?? 'db_update_failed',
          where,
          status: 409,
          message: 'Repository refused completion state change',
          details: { result },
        });
      }

      await createJob(track.recording_id, 'transcode', { trackId: track.id });
      return { bytes, storageKeyRaw: objectKey };
    } catch (e: any) {
      // even if HEAD fails, we still update state to completed
      const result = await markUploadCompletedAndSetRawKey(uploadId, objectKey);
      if ((result as any).code && (result as any).code !== 'ok') {
        throw new AppError({
          code: (result as any).code ?? 'db_update_failed',
          where,
          status: 409,
          message: 'Repository refused completion state change (post-complete, head failed)',
          details: { result, error: String(e) },
        });
      }
      
      await createJob(track.recording_id, 'transcode', { trackId: track.id });
      return { bytes: Number(totalBytes ?? 0), storageKeyRaw: objectKey };
    }
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError({
      code: 'unexpected',
      where,
      message: 'Unexpected error during multipart completion',
      details: { error: String(err) },
    });
  }
}
