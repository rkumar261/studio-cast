// src/lib/config.ts
import dotenv from 'dotenv';
dotenv.config();

export const UPLOAD_TUS_BASE_URL = process.env.UPLOAD_TUS_BASE_URL!;

export const R2 = (() => {
    const accountId = process.env.R2_ACCOUNT_ID || '';
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
    const bucket = process.env.R2_BUCKET || '';
    // If R2_ENDPOINT not set, derive from accountId
    const endpoint =
        process.env.R2_ENDPOINT ||
        (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

    return { accountId, accessKeyId, secretAccessKey, bucket, endpoint };
})();
