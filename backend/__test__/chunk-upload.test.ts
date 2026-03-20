/**
 * Unit tests for BRD-10: presigned R2 PUT URL chunk upload flow.
 *
 * Mocking strategy: stubMethod on prisma singleton + r2Adapter object.
 * r2Adapter is a plain object (not an ESM named export), so its properties
 * are writable — no mock.module() needed.
 */

import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma.js';
import { r2Adapter } from '../src/lib/r2.js';
import { initiateTrackChunkService } from '../src/services/track-chunk.service.js';
import { validateRequiredEnv } from '../src/lib/validate-env.js';
import { isLikelyR2Key } from '../src/lib/storage.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => { target[key] = original; };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const USER_PRINCIPAL = { kind: 'user' as const, userId: 'user-1' };

function makeChunkRow(id: string, trackId: string, seq: number, state = 'initiated', overrides: any = {}) {
  const now = new Date();
  return {
    id, track_id: trackId, seq, state,
    protocol: 'presigned_url',
    bytes_received: BigInt(0), bytes_expected: BigInt(2000),
    failure_reason: null, last_error_at: null, materialized_at: null,
    storage_key_raw: null, etag: null, checksum_sha256: null,
    tus_upload_id: null, tus_resource_url: null, tus_upload_state: null,
    created_at: now, updated_at: now,
    ...overrides,
  };
}

function makeTrackRow(overrides: any = {}) {
  return {
    id: 'track-1', recording_id: 'rec-1', participant_id: 'p-1',
    final_seq: null, capture_closed_at: null,
    ...overrides,
  };
}

function mockPresignPutUrl(restores: Array<() => void>) {
  restores.push(
    stubMethod(r2Adapter, 'presignPutUrl', async (key: string) => ({
      url: `https://r2.example.com/${key}?X-Amz-Signature=mock`,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    }))
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BRD-10: presigned URL chunk upload', () => {
  describe('A — initiateTrackChunkService: happy path', () => {
    it('returns presigned_url uploadPlan with url, key, expiresAt', async () => {
      const restores: Array<() => void> = [];
      try {
        // ownership check
        restores.push(stubMethod(prisma.recording, 'findUnique', async () => ({ id: 'rec-1', userId: 'user-1' })));
        // track lookup (with select, returns the select shape)
        restores.push(stubMethod(prisma.track, 'findUnique', async () => makeTrackRow()));
        // listTrackChunksByTrack → findMany (called by getTrackSeqSnapshot — no existing chunks)
        restores.push(stubMethod(prisma.track_chunk, 'findMany', async () => []));
        // getTrackChunkByTrackSeq → findUnique (called when bySeq.get() misses)
        restores.push(stubMethod(prisma.track_chunk, 'findUnique', async () => null));
        // create new chunk row
        restores.push(stubMethod(prisma.track_chunk, 'create', async ({ data }: any) =>
          makeChunkRow(`chunk-${data.seq}`, data.track_id, data.seq)
        ));
        mockPresignPutUrl(restores);

        const result = await initiateTrackChunkService({
          recordingId: 'rec-1',
          principal: USER_PRINCIPAL,
          body: { trackId: 'track-1', seq: 1, protocol: 'presigned_url' },
        });

        assert.equal(result.code, 'ok');
        assert.ok('data' in result);
        const { uploadPlan } = result.data;
        assert.ok(uploadPlan, 'uploadPlan must be present');
        assert.equal(uploadPlan.protocol, 'presigned_url');
        assert.ok(uploadPlan.url.startsWith('https://'), 'url must be a presigned HTTPS URL');
        assert.ok(uploadPlan.key.startsWith('recordings/rec-1/tracks/track-1/chunks/1'), 'key must follow canonical pattern');
        assert.ok(uploadPlan.expiresAt, 'expiresAt must be present');
        assert.ok(new Date(uploadPlan.expiresAt).getTime() > Date.now(), 'expiresAt must be in the future');
      } finally {
        for (const r of restores.reverse()) r();
      }
    });
  });

  describe('D — initiateTrackChunkService: already uploaded', () => {
    it('returns already:true and no uploadPlan when chunk is uploaded', async () => {
      const uploadedChunk = makeChunkRow('chunk-1', 'track-1', 1, 'uploaded', {
        bytes_received: BigInt(1000),
        materialized_at: new Date(),
        storage_key_raw: 'recordings/rec-1/tracks/track-1/chunks/1.webm',
      });

      const restores: Array<() => void> = [];
      try {
        restores.push(stubMethod(prisma.recording, 'findUnique', async () => ({ id: 'rec-1', userId: 'user-1' })));
        restores.push(stubMethod(prisma.track, 'findUnique', async () => makeTrackRow()));
        // getTrackSeqSnapshot: returns the uploaded chunk so bySeq.get(1) hits
        restores.push(stubMethod(prisma.track_chunk, 'findMany', async () => [uploadedChunk]));

        const result = await initiateTrackChunkService({
          recordingId: 'rec-1',
          principal: USER_PRINCIPAL,
          body: { trackId: 'track-1', seq: 1, protocol: 'presigned_url' },
        });

        assert.equal(result.code, 'ok');
        assert.ok('data' in result);
        assert.equal(result.data.already, true);
        assert.equal(result.data.uploadPlan, undefined);
      } finally {
        for (const r of restores.reverse()) r();
      }
    });
  });

  describe('E — validateRequiredEnv: startup validation', () => {
    it('throws when R2_PUBLIC_BASE_URL is missing', () => {
      const orig = process.env.R2_PUBLIC_BASE_URL;
      delete process.env.R2_PUBLIC_BASE_URL;
      try {
        assert.throws(() => validateRequiredEnv(), /R2_PUBLIC_BASE_URL/);
      } finally {
        if (orig !== undefined) process.env.R2_PUBLIC_BASE_URL = orig;
      }
    });

    it('throws when R2_BUCKET is missing', () => {
      const orig = process.env.R2_BUCKET;
      delete process.env.R2_BUCKET;
      try {
        assert.throws(() => validateRequiredEnv(), /R2_BUCKET/);
      } finally {
        if (orig !== undefined) process.env.R2_BUCKET = orig;
      }
    });

    it('passes when all required vars are set', () => {
      const vars: Record<string, string> = {
        R2_BUCKET: 'test-bucket', R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret', R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
        R2_ENDPOINT: 'https://abc.r2.cloudflarestorage.com',
      };
      const originals: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(vars)) { originals[k] = process.env[k]; process.env[k] = v; }
      try {
        assert.doesNotThrow(() => validateRequiredEnv());
      } finally {
        for (const [k, v] of Object.entries(originals)) {
          if (v === undefined) delete process.env[k]; else process.env[k] = v;
        }
      }
    });
  });

  describe('F — isLikelyR2Key: R2 key fallthrough', () => {
    it('recognises recordings/ keys as R2 keys', () => {
      assert.equal(isLikelyR2Key('recordings/rec-1/tracks/t-1/chunks/1.webm'), true);
      assert.equal(isLikelyR2Key('local/some/path.webm'), false);
      assert.equal(isLikelyR2Key(null), false);
    });
  });
});
