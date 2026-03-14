import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';

process.env.JWT_PRIVATE_KEY_PATH ??= fileURLToPath(new URL('../../certs/jwtRS256.key', import.meta.url));
process.env.JWT_PUBLIC_KEY_PATH ??= fileURLToPath(new URL('../../certs/jwtRS256.key.pub', import.meta.url));

const [{ default: recordingRoutes }, { signAccessJwt }] = await Promise.all([
  import('./recordings.routes.js'),
  import('../lib/jwt.js'),
]);

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

test('POST /v1/recordings/:id/chunks/initiate rejects live multipart transport', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
    const token = await signAccessJwt({ sub: 'user-1' });
    restores.push(
      stubMethod(prisma.user, 'findUnique', async () => ({
        id: 'user-1',
        name: 'Owner',
        email: 'owner@example.com',
        imageUrl: null,
      }))
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/recordings/rec-1/chunks/initiate',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        trackId: 'track-1',
        seq: 1,
        protocol: 'multipart',
      },
    });

    assert.equal(response.statusCode, 410);
    assert.deepEqual(response.json(), {
      code: 'live_transport_tus_only',
      message:
        'Live recording chunk transport is TUS-only. Use /v1/uploads/* for manual/import multipart workflows.',
    });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('POST /v1/recordings/:id/chunks/:chunkId/complete rejects live multipart transport', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
    const token = await signAccessJwt({ sub: 'user-1' });
    restores.push(
      stubMethod(prisma.user, 'findUnique', async () => ({
        id: 'user-1',
        name: 'Owner',
        email: 'owner@example.com',
        imageUrl: null,
      }))
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/recordings/rec-1/chunks/chunk-1/complete',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        protocol: 'multipart',
        bytesReceived: 100,
      },
    });

    assert.equal(response.statusCode, 410);
    assert.deepEqual(response.json(), {
      code: 'live_transport_tus_only',
      message:
        'Live recording chunk transport is TUS-only. Use /v1/uploads/* for manual/import multipart workflows.',
    });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('legacy live multipart routes return explicit deprecation response', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
    const token = await signAccessJwt({ sub: 'user-1' });
    restores.push(
      stubMethod(prisma.user, 'findUnique', async () => ({
        id: 'user-1',
        name: 'Owner',
        email: 'owner@example.com',
        imageUrl: null,
      }))
    );

    const initiateResponse = await app.inject({
      method: 'POST',
      url: '/v1/recordings/rec-1/chunks/multipart/initiate',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        trackId: 'track-1',
        seq: 1,
      },
    });
    assert.equal(initiateResponse.statusCode, 410);

    const completeResponse = await app.inject({
      method: 'POST',
      url: '/v1/recordings/rec-1/chunks/multipart/chunk-1/complete',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        bytesReceived: 100,
      },
    });
    assert.equal(completeResponse.statusCode, 410);
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

