import Fastify from 'fastify';
import cors from '@fastify/cors';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import cookie from '@fastify/cookie';
import recordingRoutes from './routes/recordings.routes.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  // Register routes
  await app.register(healthRoutes);
  await app.register(cookie); 
  await app.register(authRoutes);
  await app.register(recordingRoutes);

  // Minimal centralized error handler
  app.setErrorHandler((err, _req, reply) => {
    const status = (err as any)?.status ?? 500;
    reply.code(status).send({ message: err.message ?? 'Internal error' });
  });

  return app;
}