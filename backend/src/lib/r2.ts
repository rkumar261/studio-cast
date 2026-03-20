import { S3Client } from  '@aws-sdk/client-s3';
import { R2 } from './config.js';

let _r2Client: S3Client | null = null;

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