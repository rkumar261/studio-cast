import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'; // optional if you want presign later

// If you already have these utilities, import them instead:
import { R2_BUCKET, getR2Client } from '../lib/r2.js';

function requireEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env ${name}`);
    return v;
}

const MEDIA_ROOT = requireEnv('MEDIA_ROOT'); // used by TUS-completed path

export type TrackLike = {
    id: string | number;
    recording_id: string | number;
    storage_key_raw: string | null;     // R2 object key (multipart) or relative FS key (tus)
    storage_bucket?: string | null;     // optional, set for R2 path
};

export function isLikelyR2Key(key: string | null | undefined): boolean {
    if (!key) return false;
    // We store multipart raw as "recordings/<recId>/tracks/<uploadId>.raw"
    // You can tailor this check if your keys differ.
    return key.startsWith('recordings/');
}

/**
 * Ensures a directory exists.
 */
async function ensureDir(dir: string) {
    await fsp.mkdir(dir, { recursive: true });
}

/**
 * Download a key from R2 into a temp file; returns { localPath, cleanup }.
 */
export async function downloadR2ObjectToTmp(key: string): Promise<{ localPath: string; cleanup: () => Promise<void> }> {
    const r2 = getR2Client() as S3Client;
    const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
    const res = await r2.send(cmd);

    if (!res.Body) throw new Error(`R2 object has no Body for key ${key}`);

    const tmpDir = path.join(os.tmpdir(), 'riverside-lite');
    await ensureDir(tmpDir);

    const ext = path.extname(key) || '.bin';
    const base = path.basename(key, ext);
    const tmpPath = path.join(tmpDir, `${base}-${Date.now()}${ext}`);

    const body = res.Body as Readable;
    const write = fs.createWriteStream(tmpPath);
    const finished = new Promise<void>((resolve, reject) => {
        write.on('finish', resolve);
        write.on('error', reject);
    });
    body.pipe(write);
    await finished;

    return {
        localPath: tmpPath,
        cleanup: async () => {
            try { await fsp.unlink(tmpPath); } catch { /* ignore */ }
        },
    };
}

/**
 * Resolve raw media to a local path that ffmpeg can read.
 * - For R2 (multipart): downloads to tmp and returns a cleanup fn.
 * - For TUS (filesystem): returns absolute path under MEDIA_ROOT; cleanup is a noop.
 */
export async function resolveRawToLocal(track: TrackLike): Promise<{ localPath: string; cleanup: () => Promise<void> }> {
    const key = track.storage_key_raw;
    if (!key) throw new Error(`track ${track.id} has no storage_key_raw`);

    if (isLikelyR2Key(key) || (track.storage_bucket && key)) {
        // R2 path
        return downloadR2ObjectToTmp(key);
    }

    // Filesystem (tus finalized)
    // storage_key_raw is a relative key like "recordings/<recId>/tracks/<trackId>/raw/<uploadId>.bin"
    const abs = path.isAbsolute(key) ? key : path.join(MEDIA_ROOT, key);
    // optionally assert file exists
    await fsp.stat(abs);
    return { localPath: abs, cleanup: async () => { } };
}

/**
 * Upload a finished artifact to R2 under the destination key with ContentType.
 * Caller controls destKey (e.g. recordings/<recId>/tracks/<trackId>/final/<trackId>.mp4).
 */
export async function uploadFinalToR2(localPath: string, destKey: string, contentType: string) {
    const r2 = getR2Client() as S3Client;
    const body = fs.createReadStream(localPath);

    const put = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: destKey,
        Body: body,
        ContentType: contentType,
        // Optionally: CacheControl, ContentDisposition, Metadata, etc.
    });

    await r2.send(put);
}

/**
 * Utility: build standard final keys.
 *  - audio:   recordings/<recId>/tracks/<trackId>/final/<trackId>.wav
 *  - video:   recordings/<recId>/tracks/<trackId>/final/<trackId>.mp4
 */
export function buildFinalKey(recordingId: string | number, trackId: string | number, kind: 'audio' | 'video', ext?: string) {
    const safeExt = ext ?? (kind === 'audio' ? '.wav' : '.mp4');
    return `recordings/${recordingId}/tracks/${trackId}/final/${trackId}${safeExt}`;
}
