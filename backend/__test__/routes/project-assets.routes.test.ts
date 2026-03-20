import assert from 'node:assert/strict';
import path from 'node:path';
import Fastify from 'fastify';
import { prisma } from '../../src/lib/prisma.js';
import recordingRoutes from '../../src/routes/recordings.routes.js';
import { signAccessJwt, signGuestAccessJwt } from '../../src/lib/jwt.js';

process.env.JWT_PRIVATE_KEY_PATH ??= path.resolve(process.cwd(), 'certs/jwtRS256.key');
process.env.JWT_PUBLIC_KEY_PATH ??= path.resolve(process.cwd(), 'certs/jwtRS256.key.pub');
process.env.R2_PUBLIC_BASE_URL ??= 'https://cdn.example.com/riverside-lite';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

test('GET /v1/recordings/:id/project-assets returns user-facing project asset graph', async () => {
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
        userId: 'user-1',
        combined_asset: [
          {
            id: 'combined-1',
            state: 'ready',
            storage_key: 'recordings/rec-1/combined/all-participants.mp4',
            preview_key: 'recordings/rec-1/combined/all-participants.mp4',
            duration_ms: 120000,
            failure_reason: null,
          },
        ],
        transcript: [
          {
            id: 'transcript-1',
            state: 'ready',
            storage_key: 'recordings/rec-1/transcript/en.json',
            language: 'en',
            failure_reason: null,
            metadata_json: null,
          },
        ],
        export_artifact: [
          {
            id: 'export-mp4',
            type: 'mp4',
            state: 'succeeded',
            updated_at: new Date('2026-03-09T10:00:00.000Z'),
            storage_key: 'recordings/rec-1/exports/output.mp4',
            last_error: null,
          },
          {
            id: 'export-wav',
            type: 'wav',
            state: 'running',
            updated_at: new Date('2026-03-09T10:00:01.000Z'),
            storage_key: null,
            last_error: null,
          },
          {
            id: 'export-captions',
            type: 'mp4_captions',
            state: 'failed',
            updated_at: new Date('2026-03-09T10:00:02.000Z'),
            storage_key: null,
            last_error: 'captions_failed',
          },
        ],
      }))
    );
    restores.push(
      stubMethod(prisma.participant, 'findMany', async () => [
        {
          id: 'participant-host',
          role: 'host',
          display_name: 'Host User',
          email: null,
          track: [
            {
              id: 'track-host',
              kind: 'video',
              state: 'processed',
              storage_key_final: 'recordings/rec-1/participants/participant-host/master.mp4',
              duration_ms: 119000,
              created_at: new Date('2026-03-09T10:00:00.000Z'),
            },
          ],
          participant_asset: [
            {
              id: 'asset-host',
              recording_id: 'rec-1',
              participant_id: 'participant-host',
              state: 'ready',
              storage_key: 'recordings/rec-1/participants/participant-host/master.mp4',
              preview_key: 'recordings/rec-1/participants/participant-host/master.mp4',
              duration_ms: 119000,
              resolution: '1280x720',
              processing_started_at: new Date('2026-03-09T10:00:00.000Z'),
              ready_at: new Date('2026-03-09T10:00:05.000Z'),
              failed_at: null,
              failure_reason: null,
              export_set_json: ['mp4'],
              metadata_json: {},
            },
          ],
        },
        {
          id: 'participant-guest',
          role: 'guest',
          display_name: 'Guest User',
          email: null,
          track: [
            {
              id: 'track-guest',
              kind: 'video',
              state: 'uploaded',
              storage_key_final: null,
              duration_ms: null,
              created_at: new Date('2026-03-09T10:00:01.000Z'),
            },
          ],
          participant_asset: [
            {
              id: 'asset-guest',
              recording_id: 'rec-1',
              participant_id: 'participant-guest',
              state: 'processing',
              storage_key: null,
              preview_key: null,
              duration_ms: null,
              resolution: null,
              processing_started_at: new Date('2026-03-09T10:00:02.000Z'),
              ready_at: null,
              failed_at: null,
              failure_reason: null,
              export_set_json: [],
              metadata_json: {},
            },
          ],
        },
      ])
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recordings/rec-1/project-assets',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();

    assert.equal(body.project.recordingId, 'rec-1');
    assert.equal(body.project.state, 'action required');
    assert.equal(body.project.minimumReady, true);
    assert.equal(body.project.fullyProcessed, false);
    assert.equal(body.combinedAsset.label, 'All participants');
    assert.equal(body.combinedAsset.state, 'ready');
    assert.equal(body.combinedAsset.type, 'combined_playback');
    assert.equal(body.combinedAsset.minimumReady, true);
    assert.equal(body.combinedAsset.fullyProcessed, true);
    const publicBase = String(process.env.R2_PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
    assert.equal(body.combinedAsset.previewUrl, `${publicBase}/recordings/rec-1/combined/all-participants.mp4`);
    assert.equal(body.combinedAsset.playbackUrl, `${publicBase}/recordings/rec-1/combined/all-participants.mp4`);
    assert.equal(body.participantAssets.length, 2);
    assert.equal(body.participantAssets[0].label, 'Host User');
    assert.equal(body.participantAssets[0].type, 'participant_playback');
    assert.equal(body.participantAssets[0].minimumReady, true);
    assert.equal(body.participantAssets[1].state, 'processing');
    assert.equal(body.participantAssets[1].fullyProcessed, false);
    assert.equal(body.transcript.state, 'ready');
    assert.equal(body.transcript.type, 'transcript_artifact');
    assert.equal(body.captions.state, 'action required');
    assert.equal(body.captions.type, 'caption_derivative');
    assert.equal(body.exports.requiredTotal, 3);
    assert.equal(body.exports.ready, 1);
    assert.equal(body.exports.processing, 1);
    assert.equal(body.exports.actionRequired, 1);
    assert.equal(body.processingSummary.minimumReady, true);
    assert.equal(body.processingSummary.fullyProcessed, false);
    assert.equal(body.processingSummary.readyPrimaryAsset, true);
    assert.equal(body.processingSummary.readyParticipantCount, 1);
    assert.equal(body.processingSummary.participantCount, 2);
    assert.equal(body.processingSummary.pendingWork.some((item: any) => item.label === 'Guest User'), true);
    assert.equal(body.processingSummary.failedWork.some((item: any) => item.label === 'Captioned video (All participants)'), true);

    const mp4Export = body.exports.items.find((item: any) => item.type === 'mp4');
    assert.ok(mp4Export);
    assert.equal(mp4Export.state, 'ready');
    assert.equal(mp4Export.actions[0].href, '/v1/exports/export-mp4');
    assert.equal(mp4Export.blockedReason, undefined);

    const captionsExport = body.exports.items.find((item: any) => item.type === 'mp4_captions');
    assert.ok(captionsExport);
    assert.equal(captionsExport.state, 'action required');
    assert.equal(captionsExport.blockedReason, 'captions_failed');

    const guestAsset = body.participantAssets.find((a: any) => a.participant?.role === 'guest');
    assert.ok(guestAsset);
    assert.equal(guestAsset.state, 'processing');
    assert.equal(guestAsset.blockedReason, 'This participant asset is still processing.');
    assert.equal(guestAsset.pendingWork.length, 1);

    assert.equal((body as any).tracks, undefined);
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('GET /v1/recordings/:id/project-assets returns 403 for non-owner user', async () => {
  const restores: Array<() => void> = [];
  const app = Fastify();

  try {
    await app.register(recordingRoutes);
    const token = await signAccessJwt({ sub: 'user-2' });

    restores.push(
      stubMethod(prisma.user, 'findUnique', async () => ({
        id: 'user-2',
        name: 'Requester',
        email: 'requester@example.com',
        imageUrl: null,
      }))
    );

    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => ({
        id: 'rec-1',
        title: 'Weekly Sync',
        status: 'processing',
        userId: 'user-1',
        combined_asset: [],
        transcript: [],
        export_artifact: [],
      }))
    );
    restores.push(stubMethod(prisma.participant, 'findMany', async () => []));

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recordings/rec-1/project-assets',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { code: 'forbidden', message: 'Not allowed' });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('GET /v1/recordings/:id/project-assets returns 404 when recording does not exist', async () => {
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
      stubMethod(prisma.recording, 'findUnique', async () => null)
    );
    restores.push(stubMethod(prisma.participant, 'findMany', async () => []));

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recordings/missing/project-assets',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { code: 'not_found', message: 'Recording not found' });
  } finally {
    for (const restore of restores.reverse()) restore();
    await app.close();
  }
});

test('GET /v1/recordings/:id/project-assets rejects invited guest principal', async () => {
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
      url: '/v1/recordings/rec-1/project-assets',
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
