import type { FastifyInstance } from 'fastify';
import fastifyHttpProxy from '@fastify/http-proxy';

const TUSD_BASE_URL = process.env.TUSD_BASE_URL ?? 'http://127.0.0.1:1080'; // host:port only
const TUSD_PREFIX   = (process.env.TUSD_BASE_PATH ?? '/tus/').replace(/\/+$/, ''); // '/tus'

function isLoopbackHost(hostname: string) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '0.0.0.0';
}

function getForwardedOrigin(req: { headers: Record<string, unknown>; protocol?: string }) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '')
    .split(',')[0]
    .trim();
  const proto = forwardedProto || req.protocol || 'http';
  const forwardedHost = String(req.headers['x-forwarded-host'] ?? '')
    .split(',')[0]
    .trim();
  const host = forwardedHost || String(req.headers.host ?? '');
  if (!host) return null;
  return `${proto.endsWith(':') ? proto : `${proto}:`}//${host}`;
}

function shouldRewriteLocation(pathname: string) {
  const tusPrefix = `${TUSD_PREFIX}/`;
  return (
    pathname === TUSD_PREFIX ||
    pathname.startsWith(tusPrefix) ||
    pathname === '/files' ||
    pathname.startsWith('/files/')
  );
}

export default async function proxyTus(app: FastifyInstance) {
  const flag = 'tusProxyRegistered';
  if ((app as any)[flag]) {
    app.log.warn('tusd proxy already registered; skipping');
    return;
  }
  (app as any)[flag] = true;

  await app.register(fastifyHttpProxy, {
    upstream: TUSD_BASE_URL,        // http://127.0.0.1:1080
    prefix: TUSD_PREFIX,            // '/tus'
    // http-proxy strips the prefix; add it back so tusd sees /tus/...
    rewritePrefix: TUSD_PREFIX,     // <<< IMPORTANT
    httpMethods: ['GET', 'POST', 'PATCH', 'HEAD', 'OPTIONS'],
    undici: {
      bodyTimeout: 0,               // allow long body streams
      headersTimeout: 60_000,
    },
    replyOptions: {
      rewriteHeaders(headers, req) {
        if (!req) return headers;
        const rawLocation = Array.isArray(headers.location) ? headers.location[0] : headers.location;
        if (!rawLocation) return headers;

        const forwardedOrigin = getForwardedOrigin(req as any);
        if (!forwardedOrigin) return headers;

        try {
          const parsed = new URL(rawLocation, forwardedOrigin);
          const isRelativeLocation = !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(rawLocation);
          const isLoopbackLocation = isLoopbackHost(parsed.hostname);
          if (!isRelativeLocation && !isLoopbackLocation) return headers;
          if (!shouldRewriteLocation(parsed.pathname)) return headers;

          const target = new URL(parsed.pathname + parsed.search, forwardedOrigin);
          target.hash = parsed.hash;
          headers.location = target.toString();
        } catch {
          // If location is a relative path that URL parsing rejected, fallback manually.
          if (rawLocation.startsWith('/')) {
            headers.location = `${forwardedOrigin}${rawLocation}`;
          }
        }

        return headers;
      },
    },
    // keep headers as-is (Tus-*, Upload-*)
    // no need to modify onSend; CORS is handled by @fastify/cors
  });
}
