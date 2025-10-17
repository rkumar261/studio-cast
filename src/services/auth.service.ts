import * as jose from 'jose';
import {
  upsertUserFromGoogle,
  storeRefreshToken,
  revokeRefreshByJti,
  findRefreshByJti,
} from '../repositories/auth.repo.js';
import {
  signAccessJwt,
  signRefreshJwt,
  verifyRefreshJwt,
  sha256,
} from '../lib/jwt.js';

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const clientId = required('GOOGLE_CLIENT_ID');
const clientSecret = required('GOOGLE_CLIENT_SECRET');
const redirectUri = required('OAUTH_REDIRECT_URI');

const googleJwks = jose.createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

/** Extra params for PKCE/nonce */
type GoogleAuthExtra = {
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
  nonce?: string;
};

/**
 * Build Google OAuth URL with state (+ optional PKCE S256 + nonce).
 */
export function getGoogleAuthUrl(state: string, extra?: GoogleAuthExtra) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });

  if (extra?.codeChallenge) {
    p.set('code_challenge', extra.codeChallenge);
    p.set('code_challenge_method', extra.codeChallengeMethod ?? 'S256');
  }
  if (extra?.nonce) {
    p.set('nonce', extra.nonce);
  }

  return `${GOOGLE_AUTH_URL}?${p.toString()}`;
}

/**
 * Exchange code → tokens, verify id_token, upsert user, issue access/refresh.
 * Supports PKCE: pass { pkceVerifier } to include code_verifier in the token request.
 * Optionally validate nonce via { expectedNonce }.
 */
export async function handleGoogleCallback(
  code: string,
  meta: { ua?: string; ip?: string } = {},
  opts?: { pkceVerifier?: string; expectedNonce?: string }
) {
  // 1) Exchange code → tokens (include PKCE verifier if provided)
  const form = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (opts?.pkceVerifier) {
    form.set('code_verifier', opts.pkceVerifier);
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  const tokenRes = (await res.json()) as any;
  const idToken = tokenRes.id_token as string | undefined;
  if (!idToken) throw new Error('No id_token in Google response');

  // 2) Verify id_token (signature + audience + issuer)
  const { payload } = await jose.jwtVerify(idToken, googleJwks, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  });

  // Optional: verify nonce if you sent one on the auth request
  if (opts?.expectedNonce) {
    if (!payload.nonce || payload.nonce !== opts.expectedNonce) {
      throw new Error('invalid_nonce');
    }
  }

  // 3) Upsert user & link OAuth account
  const user = await upsertUserFromGoogle({
    sub: String(payload.sub),
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
    picture: payload.picture as string | undefined,
  });

  // 4) Issue tokens
  const access = await signAccessJwt({ sub: user.id });
  const { token: refresh, jti, expMs } = await signRefreshJwt(user.id);

  // 5) Persist refresh so we can rotate/revoke later
  await storeRefreshToken({
    userId: user.id,
    jti,
    rawToken: refresh,
    expMs,
    userAgent: meta.ua,
    ip: meta.ip,
  });

  return { user, access, refresh, jti };
}

/**
 * Rotate refresh token: verifies, checks DB, revokes old, issues new pair.
 */
export async function rotateRefresh(oldRefresh: string) {
  // verify signature/exp and read jti/sub
  const { payload } = await verifyRefreshJwt(oldRefresh);
  const userId = String(payload.sub ?? '');
  const jti = String(payload.jti ?? '');

  // check DB record
  const record = await findRefreshByJti(jti);
  if (!record || record.revokedAt) throw new Error('refresh_revoked_or_missing');
  if (record.hashedToken !== sha256(oldRefresh)) throw new Error('refresh_mismatch');

  // revoke old & issue new
  await revokeRefreshByJti(jti);

  const access = await signAccessJwt({ sub: userId });
  const { token: refresh, jti: newJti, expMs } = await signRefreshJwt(userId);
  await storeRefreshToken({ userId, jti: newJti, rawToken: refresh, expMs });

  return { access, refresh };
}

/**
 * Logout: revoke given refresh token (by jti).
 */
export async function logout(refreshToken?: string, opts?: { allDevices?: boolean }) {
  try {
    if (!refreshToken) return;

    const { payload } = await verifyRefreshJwt(refreshToken);
    const jti = String(payload.jti ?? '');
    const userId = String(payload.sub ?? '');

    if (!jti) return;

    if (opts?.allDevices) {
      // Optional: if you implement this in the repo later, call it here.
      // await revokeAllRefreshByUserId(userId);
      await revokeRefreshByJti(jti); // fallback: just revoke current
    } else {
      await revokeRefreshByJti(jti);
    }
  } catch {
    // swallow errors: logout should be idempotent and "best effort"
  }
}
