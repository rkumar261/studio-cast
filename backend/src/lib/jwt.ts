import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import * as jose from 'jose';

function must(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env ${name}`);
    return v;
}

const privatePem = fs.readFileSync(must('JWT_PRIVATE_KEY_PATH'), 'utf8');
const publicPem = fs.readFileSync(must('JWT_PUBLIC_KEY_PATH'), 'utf8');

function parseTTL(ttl: string, fallbackMs: number) {
    const m = /^(\d+)([smhd])$/i.exec(ttl || '');
    if (!m) return fallbackMs;
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    return n * (u === 's' ? 1000 : u === 'm' ? 60000 : u === 'h' ? 3600000 : 86400000);
}

const accessTtlMs = parseTTL(process.env.JWT_ACCESS_TTL ?? '15m', 15 * 60_000);
const refreshTtlMs = parseTTL(process.env.JWT_REFRESH_TTL ?? '7d', 7 * 24 * 60 * 60_000);

function pemToBuf(pem: string) {
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    return Buffer.from(b64, 'base64');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
    const pkcs8 = pemToBuf(pem);
    return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function importPublicKey(pem: string): Promise<CryptoKey> {
    const spki = pemToBuf(pem);
    return crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

export function sha256(s: string) {
    return createHash('sha256').update(s, 'utf8').digest('hex');
}

export async function signAccessJwt(payload: Record<string, unknown>) {
    const key = await importPrivateKey(privatePem);
    const now = Math.floor(Date.now() / 1000);
    return new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt(now)
        .setExpirationTime(now + Math.floor(accessTtlMs / 1000))
        .sign(key);
}

export async function signRefreshJwt(userId: string) {
    const key = await importPrivateKey(privatePem);
    const now = Math.floor(Date.now() / 1000);
    const jti = randomUUID();
    const exp = now + Math.floor(refreshTtlMs / 1000);
    const token = await new jose.SignJWT({ sub: userId, jti })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt(now)
        .setExpirationTime(exp)
        .sign(key);
    return { token, jti, expMs: exp * 1000 };
}

export async function verifyAccessJwt(jwt: string) {
    const key = await importPublicKey(publicPem);
    return jose.jwtVerify(jwt, key, { algorithms: ['RS256'] });
}

export async function verifyRefreshJwt(jwt: string) {
    const key = await importPublicKey(publicPem);
    return jose.jwtVerify(jwt, key, { algorithms: ['RS256'] });
}
