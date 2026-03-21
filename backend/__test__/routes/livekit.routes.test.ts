import assert from 'node:assert/strict';
import path from 'node:path';
import Fastify from 'fastify';
import { prisma } from '../../src/lib/prisma.js';
import livekitRoutes from '../../src/routes/livekit.routes.js';
import { signGuestAccessJwt } from '../../src/lib/jwt.js';

process.env.JWT_PRIVATE_KEY_PATH ??= path.resolve(process.cwd(), 'certs/jwtRS256.key');
process.env.JWT_PUBLIC_KEY_PATH ??= path.resolve(process.cwd(), 'certs/jwtRS256.key.pub');
process.env.LIVEKIT_API_KEY ??= 'test-livekit-key';
process.env.LIVEKIT_API_SECRET ??= 'test-livekit-secret';
process.env.LIVEKIT_WS_URL ??= 'ws://localhost:7880';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

test('POST /v1/livekit/token mints guest-scoped token for invited recording', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(livekitRoutes);
    const guestToken = await signGuestAccessJwt({
      participantId: 'participant-guest-1',
      recordingId: 'rec-1',
    });

    restores.push(
      stubMethod(prisma.participant, 'findUnique', async () => ({
        id: 'participant-guest-1',
        recording_id: 'rec-1',
        role: 'guest',
        display_name: 'Guest One',
        email: null,
      }))
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/livekit/token',
      headers: {
        authorization: `Bearer ${guestToken}`,
      },
      payload: {
        roomName: 'rec-1',
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(typeof body.token, 'string');
    assert.ok(body.token.length > 10);
    assert.equal(body.wsUrl, process.env.LIVEKIT_WS_URL);
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('POST /v1/livekit/token rejects guest request outside recording scope', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(livekitRoutes);
    const guestToken = await signGuestAccessJwt({
      participantId: 'participant-guest-1',
      recordingId: 'rec-1',
    });

    restores.push(
      stubMethod(prisma.participant, 'findUnique', async () => ({
        id: 'participant-guest-1',
        recording_id: 'rec-1',
        role: 'guest',
        display_name: 'Guest One',
        email: null,
      }))
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/livekit/token',
      headers: {
        authorization: `Bearer ${guestToken}`,
      },
      payload: {
        roomName: 'rec-2',
      },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, 'forbidden');
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});
