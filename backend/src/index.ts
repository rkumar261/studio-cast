import 'dotenv/config';
import { buildApp } from './app.js';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8080);

const app = await buildApp();

try {
  await app.listen({ host: HOST, port: PORT });
  app.log.info(`API listening on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error({ err }, 'Failed to start server');
  process.exit(1);
}
