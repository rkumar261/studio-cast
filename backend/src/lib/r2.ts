import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2 } from './config.js';

let _r2Client: S3Client | null = null;

const PRESIGNED_URL_EXPIRY_SECONDS = 60 * 60;

export function getR2Client(): S3Client {
    if (_r2Client) return _r2Client;

    if (!R2.endpoint || !R2.accessKeyId || !R2.secretAccessKey) {
        throw new Error('R2 is not configured (endpoint/keys missing)');
    }

    _r2Client = new S3Client({
        region: 'auto',
        endpoint: R2.endpoint,
        credentials: {
            accessKeyId: R2.accessKeyId,
            secretAccessKey: R2.secretAccessKey,
        },
        forcePathStyle: true,
    });
    return _r2Client;
}

export const R2_BUCKET = R2.bucket;

/**
 * Mutable adapter holding R2 operations.
 * Tests stub r2Adapter.presignPutUrl instead of the module-level function
 * (ESM named exports are read-only; object properties are not).
 */
export const r2Adapter = {
    async presignPutUrl(key: string): Promise<{ url: string; expiresAt: string }> {
        const r2 = getR2Client();
        const cmd = new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            ContentType: 'video/webm',
        });
        const url = await getSignedUrl(r2, cmd, { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS });
        const expiresAt = new Date(Date.now() + PRESIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();
        return { url, expiresAt };
    },
};