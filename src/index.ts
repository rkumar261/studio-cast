import { buildApp } from './app.js';

const PORT = Number(process.env.PORT) || 8080;

const app = await buildApp();
await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`Server listening on port ${PORT}`);
