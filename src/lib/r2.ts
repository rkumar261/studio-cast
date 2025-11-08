import { S3Client } from  '@aws-sdk/client-s3';
import { R2 } from './config.js';


export function getR2Client() {
    
    if (!R2.endpoint || !R2.accessKeyId || !R2.secretAccessKey) {
        throw new Error('R2 is not configured (endpoint/keys missing)');
    }

    return new S3Client({
        region: 'auto',
        endpoint: R2.endpoint,
        credentials: {
            accessKeyId: R2.accessKeyId,
            secretAccessKey: R2.secretAccessKey
        },
        forcePathStyle: true,
    });
}

export const R2_BUCKET = R2.bucket;