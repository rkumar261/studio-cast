// scripts/gen-jwt-keys.ts (ESM)
import { writeFileSync, mkdirSync } from 'fs';
import { generateKeyPairSync } from 'crypto';

mkdirSync('certs', { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

writeFileSync('certs/jwtRS256.key', privateKey);
writeFileSync('certs/jwtRS256.key.pub', publicKey);

console.log('✅ Keys written to certs/jwtRS256.key (+ .pub)');
