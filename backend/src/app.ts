import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';

import { validateRequiredEnv } from './lib/validate-env.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import recordingRoutes from './routes/recordings.routes.js';
import uploadsRoutes from './routes/uploads.routes.js';
import participantRoutes from './routes/participants.routes.js';
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
  validateRequiredEnv();

  const app = Fastify({ logger: true });
  const allowedOrigins = buildAllowedOrigins();

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
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: [],
  });

  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'studio-cast-dev-secret',
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(analyticsRoutes);
  await app.register(recordingRoutes);
  await app.register(uploadsRoutes);
  await app.register(participantRoutes);
  await app.register(tracksRoutes);
  await app.register(exportsRoutes);
  await app.register(transcriptsRoutes);
  await app.register(studioWebsocketRoutes);
  await app.register(livekitRoutes);

  app.setErrorHandler((err, _req, reply) => {
    const status = (err as any)?.status ?? 500;
    app.log.error(err);
    reply.code(status).send({ message: err.message ?? 'Internal server error' });
  });

  return app;
}
