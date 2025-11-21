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

export async function buildApp() {
  const app = Fastify({ logger: true });

  // Register the TUS reverse proxy FIRST so /tus/* goes straight to tusd
  await app.register(proxyTus);

  // Skip any global validation/parsing for /tus/*
  app.addHook('preValidation', (req, _res, next) => {
    if (req.url.startsWith('/tus/')) return next();
    next();
  });

  // CORS after the proxy; include all TUS headers
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'HEAD', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Tus-Resumable',
      'Upload-Length',
      'Upload-Defer-Length',
      'Upload-Offset',
      'Upload-Metadata',
      'Content-Type',
      'Authorization',
    ],
  });

  // Cookies
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'riverside-dev-secret',
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