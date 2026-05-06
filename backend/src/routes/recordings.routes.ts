import type { FastifyInstance } from 'fastify';
import recordingCrudRoutes from './recordings.crud.routes.js';
import recordingAssetsRoutes from './recordings.assets.routes.js';
import recordingSessionRoutes from './recordings.session.routes.js';
import recordingChunksRoutes from './recordings.chunks.routes.js';

export default async function recordingRoutes(app: FastifyInstance) {
  await app.register(recordingCrudRoutes);
  await app.register(recordingAssetsRoutes);
  await app.register(recordingSessionRoutes);
  await app.register(recordingChunksRoutes);
}
