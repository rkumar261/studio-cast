import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client, R2_BUCKET } from '../lib/r2.js';
import { getTrackById } from '../repositories/track.repo.js';

/**
 * Small helper to throw a consistent error when the final artifact isn't ready.
 */
function finalNotReady() {
    const e: any = new Error('final_not_ready');
    e.code = 'final_not_ready';
    return e;
}

/**
 * Returns a short-lived signed URL for the track's final artifact in R2.
 * - Looks up the track's `storage_key_final` via the repo layer.
 * - Presigns a GET URL (default 10 minutes).
 * - Forces a download filename based on the track id (you can tweak per kind later).
 *
 * Throws { code: 'final_not_ready' } if the final doesn't exist yet.
 */
export async function getTrackFinalUrl(trackId: string) {
    // Fetch only what we need via repo
    const row = await getTrackById(trackId, { storage_key_final: true });
    const finalKey = row?.storage_key_final ?? null;
    if (!finalKey) throw finalNotReady();

    const r2 = getR2Client() as S3Client;

    const cmd = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: finalKey,
        // Optional: force a download name; if you store track.kind you could switch mp4/wav here
        ResponseContentDisposition: `attachment; filename="${trackId}.mp4"`,
    });

    // 10-minute signed URL (adjust as needed)
    const url = await getSignedUrl(r2, cmd, { expiresIn: 600 });

    return { url, key: finalKey };
}
