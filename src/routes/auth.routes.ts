// src/routes/auth.routes.ts
import { FastifyPluginAsync } from 'fastify';
import '@fastify/cookie';
import crypto from 'node:crypto';
import { getGoogleAuthUrl, handleGoogleCallback, rotateRefresh } from '../services/auth.service.js';
import { authGuard } from '../middlewares/auth.guard.js';
import { createPkcePair } from '../lib/pkce.js';
import { logout } from '../services/auth.service.js';

const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN ?? 'localhost';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE ?? 'false') === 'true';

// short lifetime for oauth cookies (seconds)
const OAUTH_TMP_MAX_AGE = 60 * 5; // 5 minutes

const routes: FastifyPluginAsync = async (app) => {
  /**
   * Step 1: Start Google OAuth with PKCE (S256)
   * - Create state + PKCE code_verifier/code_challenge
   * - Store state & verifier in HttpOnly cookies (short TTL)
   * - Redirect to Google with code_challenge & S256
   */
  app.get('/auth/oauth/google/start', async (_req, reply) => {
    const state = crypto.randomUUID();
    const { verifier, challenge } = await createPkcePair();

    // Store state + verifier as short-lived, HttpOnly cookies
    reply.setCookie('oauth_state', state, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      domain: COOKIE_DOMAIN,
      maxAge: OAUTH_TMP_MAX_AGE,
    });
    reply.setCookie('pkce_verifier', verifier, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      domain: COOKIE_DOMAIN,
      maxAge: OAUTH_TMP_MAX_AGE,
    });

    // Build Google auth URL including PKCE params.
    // If your getGoogleAuthUrl already supports extra params, pass them in; otherwise, construct inside that function.
    const authUrl = getGoogleAuthUrl(state, {
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
    });

    return reply.redirect(authUrl);
  });

  /**
   * Step 2: OAuth callback
   * - Validate state
   * - Retrieve PKCE code_verifier and pass it to token exchange
   * - Issue our own access/refresh cookies
   */
  app.get('/auth/oauth/google/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string };

    const savedState = (req.cookies as any)['oauth_state'];
    const verifier = (req.cookies as any)['pkce_verifier'];

    if (!code || !state || state !== savedState) {
      return reply.code(400).send({ error: 'invalid_state_or_code' });
    }
    if (!verifier) {
      return reply.code(400).send({ error: 'missing_pkce_verifier' });
    }

    // Clear temporary cookies regardless of outcome
    reply.clearCookie('oauth_state', { path: '/', domain: COOKIE_DOMAIN });
    reply.clearCookie('pkce_verifier', { path: '/', domain: COOKIE_DOMAIN });

    // ⬇️ IMPORTANT: update your handleGoogleCallback to accept the PKCE verifier
    // and include it in the token exchange POST to Google (`code_verifier`).
    const { user, access, refresh } = await handleGoogleCallback(
      code,
      { ua: req.headers['user-agent'], ip: req.ip },
      { pkceVerifier: verifier } // <-- add this param in your service
    );

    // Set session cookies
    reply.setCookie('access_token', access, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      domain: COOKIE_DOMAIN,
    });
    reply.setCookie('refresh_token', refresh, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      domain: COOKIE_DOMAIN,
    });

    // For now, return JSON (your UI can redirect client-side)
    return reply.send({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  });

  /**
   * Step 3: Refresh (rotating)
   */
  app.post('/auth/refresh', async (req, reply) => {
    const rt = (req.cookies as any)?.refresh_token as string | undefined;
    if (!rt) return reply.code(401).send({ error: 'no_refresh' });
    try {
      const { access, refresh } = await rotateRefresh(rt);
      reply.setCookie('access_token', access, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: COOKIE_SECURE,
        domain: COOKIE_DOMAIN,
      });
      reply.setCookie('refresh_token', refresh, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: COOKIE_SECURE,
        domain: COOKIE_DOMAIN,
      });
      return reply.code(204).send();
    } catch {
      return reply.code(401).send({ error: 'refresh_failed' });
    }
  });

  /**
   * Step 4: Me (protected)
   */
  app.get('/auth/me', { preHandler: authGuard }, async (req, reply) => {
    const user = (req as any).user;
    return reply.send({ user });
  });

  /**
   * (Optional, recommended) Step 5: Logout
   * - Revoke current refresh token (and/or family) in your service
   * - Clear cookies
   */
    app.post('/auth/logout', async (req, reply) => {
      const rt = (req.cookies as any)?.refresh_token as string | undefined;

      // best-effort revoke
      await logout(rt);

      // clear cookies
      reply.clearCookie('access_token', { path: '/', domain: COOKIE_DOMAIN });
      reply.clearCookie('refresh_token', { path: '/', domain: COOKIE_DOMAIN });

      return reply.code(200).send({
        status: 'success',
        message: 'Logout successful',
        data: null
      });
    });
};



export default routes;