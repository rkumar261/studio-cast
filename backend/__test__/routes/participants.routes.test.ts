import assert from 'node:assert/strict';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { prisma } from '../../src/lib/prisma.js';
import participantRoutes from '../../src/routes/participants.routes.js';

process.env.JWT_PRIVATE_KEY_PATH ??= path.resolve(process.cwd(), 'certs/jwtRS256.key');
process.env.JWT_PUBLIC_KEY_PATH ??= path.resolve(process.cwd(), 'certs/jwtRS256.key.pub');

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

test('POST /v1/guest/bootstrap accepts valid invite, requires name, and sets guest cookie', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(cookie);
    await app.register(participantRoutes);

    restores.push(
      stubMethod(prisma.participant, 'findFirst', async () => ({
        id: 'participant-guest-1',
        recording_id: 'rec-1',
        role: 'guest',
        display_name: null,
        email: null,
        invite_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        invite_revoked_at: null,
        invite_claimed_at: null,
      }))
    );
    restores.push(
      stubMethod(prisma.participant, 'update', async () => ({
        id: 'participant-guest-1',
        recording_id: 'rec-1',
        role: 'guest',
        display_name: 'Guest One',
        email: 'guest@example.com',
        invite_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        invite_revoked_at: null,
        invite_claimed_at: new Date('2026-03-14T00:00:00.000Z'),
      }))
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/guest/bootstrap',
      payload: {
        token: 'invite-token-1',
        displayName: 'Guest One',
        email: 'guest@example.com',
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().participant.id, 'participant-guest-1');
    assert.match(String(response.headers['set-cookie'] ?? ''), /guest_access_token=/);
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('POST /v1/guest/bootstrap rejects missing guest name', async () => {
  const app = Fastify();

  try {
    await app.register(cookie);
    await app.register(participantRoutes);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/guest/bootstrap',
      payload: {
        token: 'invite-token-1',
        displayName: '   ',
      },
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), {
      code: 'invalid_display_name',
      message: 'displayName is required',
    });
  } finally {
    await app.close();
  }
});

test('POST /v1/guest/bootstrap rejects invalid invite token', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(cookie);
    await app.register(participantRoutes);

    restores.push(stubMethod(prisma.participant, 'findFirst', async () => null));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/guest/bootstrap',
      payload: {
        token: 'missing-token',
        displayName: 'Guest One',
      },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      code: 'invalid_token',
      message: 'Invalid or expired guest invite token',
    });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('POST /v1/guest/bootstrap rejects expired invite token', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(cookie);
    await app.register(participantRoutes);

    restores.push(
      stubMethod(prisma.participant, 'findFirst', async () => ({
        id: 'participant-guest-1',
        recording_id: 'rec-1',
        role: 'guest',
        display_name: null,
        email: null,
        invite_expires_at: new Date('2026-03-01T00:00:00.000Z'),
        invite_revoked_at: null,
        invite_claimed_at: null,
      }))
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/guest/bootstrap',
      payload: {
        token: 'expired-token',
        displayName: 'Guest One',
      },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      code: 'invalid_token',
      message: 'Invalid or expired guest invite token',
    });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});
