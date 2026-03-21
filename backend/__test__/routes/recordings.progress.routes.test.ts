import assert from 'node:assert/strict';
import path from 'node:path';
import Fastify from 'fastify';
import { prisma } from '../../src/lib/prisma.js';
import recordingRoutes from '../../src/routes/recordings.routes.js';
import { signAccessJwt, signGuestAccessJwt } from '../../src/lib/jwt.js';

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

function buildRecordingForProgress(recordingId: string) {
  return {
    id: recordingId,
    userId: 'owner-user-1',
    status: 'uploading',
    started_at: new Date('2026-03-12T05:00:00.000Z'),
    stopped_at: null,
    host_participant_id: 'participant-host-1',
    control_version: 1,
    export_artifact: [],
    combined_asset: [],
    participant: [
      {
        id: 'participant-guest-1',
        role: 'guest',
        display_name: 'Guest One',
        track: [],
      },
      {
        id: 'participant-host-1',
        role: 'host',
        display_name: 'Host One',
        track: [],
      },
    ],
  };
}

test('GET /v1/recordings/:id/progress allows invited guest principal', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
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
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => buildRecordingForProgress('rec-1'))
    );
    restores.push(stubMethod(prisma.participant, 'findMany', async () => []));

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recordings/rec-1/progress',
      headers: {
        authorization: `Bearer ${guestToken}`,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.recordingId, 'rec-1');
    assert.equal(body.studioState, 'recording');
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('GET /v1/recordings/:id returns consumer recording metadata without track internals', async () => {
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
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => ({
        id: 'rec-1',
        title: 'Weekly Sync',
        status: 'processing',
        created_at: new Date('2026-03-12T05:00:00.000Z'),
        userId: 'user-1',
      }))
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recordings/rec-1',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      recording: {
        id: 'rec-1',
        title: 'Weekly Sync',
        createdAt: '2026-03-12T05:00:00.000Z',
      },
    });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('GET /v1/recordings/:id/lifecycle-diagnostics returns owner-only lifecycle detail', async () => {
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
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => ({
        id: 'rec-1',
        userId: 'user-1',
        status: 'uploading',
        lifecycle_state: 'post_stop_uploading',
        started_at: new Date('2026-03-12T05:00:00.000Z'),
        stopped_at: new Date('2026-03-12T05:10:00.000Z'),
        upload_completed_at: null,
        processing_started_at: null,
        ready_at: null,
        failed_at: null,
        failure_reason: null,
        track: [
          {
            id: 'track-1',
            participant_id: 'participant-1',
            kind: 'video',
            state: 'recording',
            lifecycle_state: 'finalized',
            final_seq: 3,
            capture_closed_at: new Date('2026-03-12T05:10:00.000Z'),
            finalized_at: new Date('2026-03-12T05:10:01.000Z'),
            ingest_ready_at: null,
            stitched_at: null,
            transcoded_at: null,
            ready_at: null,
            failed_at: null,
            failure_reason: null,
            storage_key_raw: null,
            storage_key_final: null,
            track_chunk: [
              { seq: 1, state: 'uploaded', storage_key_raw: 'chunk-1' },
              { seq: 2, state: 'uploaded', storage_key_raw: 'chunk-2' },
            ],
          },
        ],
      }))
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recordings/rec-1/lifecycle-diagnostics',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.recording.canonicalLifecycleState, 'post_stop_uploading');
    assert.equal(body.tracks[0].highestExistingSeq, 2);
    assert.equal(body.tracks[0].blockedReason, 'missing_chunks');
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('GET /v1/recordings/:id/progress rejects guest for different recording id', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
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
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => buildRecordingForProgress('rec-2'))
    );
    restores.push(stubMethod(prisma.participant, 'findMany', async () => []));

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recordings/rec-2/progress',
      headers: {
        authorization: `Bearer ${guestToken}`,
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { code: 'forbidden', message: 'Not allowed' });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('GET /v1/recordings/:id/session allows invited guest principal', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
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
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => ({
        id: 'rec-1',
        userId: 'owner-user-1',
        status: 'uploading',
        started_at: new Date('2026-03-12T05:00:00.000Z'),
        stopped_at: null,
        host_participant_id: 'participant-host-1',
        control_version: 3,
      }))
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recordings/rec-1/session',
      headers: {
        authorization: `Bearer ${guestToken}`,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.canControl, false);
    assert.equal(body.session.recordingId, 'rec-1');
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('GET /v1/recordings/:id rejects invited guest principal', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
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
      method: 'GET',
      url: '/v1/recordings/rec-1',
      headers: {
        authorization: `Bearer ${guestToken}`,
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { code: 'forbidden', message: 'Not allowed' });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('GET /v1/recordings rejects invited guest principal', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
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
      method: 'GET',
      url: '/v1/recordings',
      headers: {
        authorization: `Bearer ${guestToken}`,
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { code: 'forbidden', message: 'Not allowed' });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('GET /v1/recordings/:id/lifecycle-diagnostics rejects invited guest principal', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
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
      method: 'GET',
      url: '/v1/recordings/rec-1/lifecycle-diagnostics',
      headers: {
        authorization: `Bearer ${guestToken}`,
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { code: 'forbidden', message: 'Not allowed' });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('POST /v1/recordings/:id/session/start rejects invited guest principal', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
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
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => ({
        id: 'rec-1',
        userId: 'owner-user-1',
        status: 'uploading',
        started_at: new Date('2026-03-12T05:00:00.000Z'),
        stopped_at: null,
        host_participant_id: 'participant-host-1',
        control_version: 3,
      }))
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/recordings/rec-1/session/start',
      headers: {
        authorization: `Bearer ${guestToken}`,
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { code: 'forbidden', message: 'Not allowed' });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('POST /v1/recordings/:id/session/stop rejects invited guest principal', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
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
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => ({
        id: 'rec-1',
        userId: 'owner-user-1',
        status: 'uploading',
        started_at: new Date('2026-03-12T05:00:00.000Z'),
        stopped_at: null,
        host_participant_id: 'participant-host-1',
        control_version: 3,
      }))
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/recordings/rec-1/session/stop',
      headers: {
        authorization: `Bearer ${guestToken}`,
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { code: 'forbidden', message: 'Not allowed' });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});
