import 'dotenv/config';
import { buildApp } from './app.js';
import { validateTusStorageContractFromEnv } from './lib/tus-storage-contract.js';

const HOST = process.env.HOST ?? '127.0.0.1'; // match tusd hooks target
const PORT = Number(process.env.PORT ?? 8080);

const tusStorageValidation = await validateTusStorageContractFromEnv();
if (!tusStorageValidation.ok) {
  console.error('[startup] invalid TUS storage contract', {
    code: tusStorageValidation.code,
    message: tusStorageValidation.message,
    details: tusStorageValidation.details,
  });
  process.exit(1);
}

const app = await buildApp();

try {
  await app.listen({ host: HOST, port: PORT });
  app.log.info(`API listening on http://${HOST}:${PORT}`);
  app.log.info(
    `TUS proxy: ${process.env.TUSD_BASE_PATH ?? '/tus/'} → ${process.env.TUSD_BASE_URL ?? 'http://127.0.0.1:1080'}`
  );
} catch (err) {
  app.log.error({ err }, 'Failed to start server');
  process.exit(1);
}
