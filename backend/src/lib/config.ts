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


// Public base URL used for browser downloads
export const R2_PUBLIC_BASE_URL =
    process.env.R2_PUBLIC_BASE_URL ||
    (R2.endpoint && R2.bucket
        ? `${R2.endpoint.replace(/\/$/, '')}/${R2.bucket}`
        : '');
