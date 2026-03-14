import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';

import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import recordingRoutes from './routes/recordings.routes.js';
import uploadsRoutes from './routes/uploads.routes.js';
import participantRoutes from './routes/participants.routes.js';
import proxyTus from './routes/proxy-tus.routes.js';
import tusdHooksRoutes from './routes/tusd-hooks.routes.js';
import tracksRoutes from './routes/tracks.routes.js';
import exportsRoutes from './routes/exports.routes.js';
import transcriptsRoutes from './routes/transcripts.routes.js';
import studioWebsocketRoutes from './routes/studio-websocket.routes.js';
import livekitRoutes from './routes/livekit.routes.js';


const DEFAULT_CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, '');
}

function buildAllowedOrigins() {
  const configured = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  return new Set<string>([...DEFAULT_CORS_ORIGINS, ...configured]);
}

export async function buildApp() {
  const app = Fastify({ logger: true });
  const allowedOrigins = buildAllowedOrigins();

  // CORS for API + tus proxy routes.
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = normalizeOrigin(origin);
      callback(null, allowedOrigins.has(normalized));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'HEAD', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Tus-Resumable',
      'Upload-Length',
      'Upload-Defer-Length',
      'Upload-Offset',
      'Upload-Metadata',
      'Upload-Checksum',
      'Upload-Concat',
      'Content-Type',
      'Authorization',
    ],
    exposedHeaders: [
      'Location',
      'Tus-Resumable',
      'Upload-Offset',
      'Upload-Length',
      'Upload-Metadata',
      'Upload-Expires',
      'Upload-Checksum',
      'Upload-Concat',
    ],
  });

  // Cookies
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'riverside-dev-secret',
  });

  // Register the TUS reverse proxy before app routes.
  await app.register(proxyTus);

  // Skip any global validation/parsing for /tus/*
  app.addHook('preValidation', (req, _res, next) => {
    if (req.url.startsWith('/tus/')) return next();
    next();
  });

  // Your routes
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(recordingRoutes);
  await app.register(uploadsRoutes);
  await app.register(participantRoutes);
  await app.register(tracksRoutes);
  await app.register(exportsRoutes);
  await app.register(transcriptsRoutes);
  await app.register(studioWebsocketRoutes);
  await app.register(livekitRoutes); 
  
  // tusd HTTP hooks (pre-create / post-create)
  await app.register(tusdHooksRoutes);

  // Centralized Error Handler
  app.setErrorHandler((err, _req, reply) => {
    const status = (err as any)?.status ?? 500;
    app.log.error(err);
    reply.code(status).send({ message: err.message ?? 'Internal server error' });
  });

  return app;
}
