import type { FastifyInstance } from 'fastify';
import fastifyHttpProxy from '@fastify/http-proxy';

const TUSD_BASE_URL = process.env.TUSD_BASE_URL ?? 'http://127.0.0.1:1080'; // host:port only
const TUSD_PREFIX   = (process.env.TUSD_BASE_PATH ?? '/tus/').replace(/\/+$/, ''); // '/tus'

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
    // keep headers as-is (Tus-*, Upload-*)
    // no need to modify onSend; CORS is handled by @fastify/cors
  });
}
