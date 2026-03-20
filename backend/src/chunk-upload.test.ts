/**
 * Unit tests for BRD-10: presigned R2 PUT URL chunk upload flow.
 *
 * Tests run via: node --test --import tsx src/chunk-upload.test.ts
 *
 * Mocking strategy:
 *  - R2 SDK (@aws-sdk/s3-request-presigner, @aws-sdk/client-s3) — mocked in-process
 *  - prisma — mocked via module-level override
 *  - Repositories — mocked inline
 */

import { describe, it, before, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Module mocks — must be set up before importing the modules under test.
// ---------------------------------------------------------------------------

// Mock @aws-sdk/s3-request-presigner so getSignedUrl returns a predictable URL.
mock.module('@aws-sdk/s3-request-presigner', {
  namedExports: {
    getSignedUrl: async (_client: unknown, cmd: any) => {
      const key = cmd.input?.Key ?? 'mock-key';
      return `https://r2.example.com/${key}?X-Amz-Signature=mock`;
    },
  },
});

// Mock @aws-sdk/client-s3 PutObjectCommand.
mock.module('@aws-sdk/client-s3', {
  namedExports: {
    S3Client: class MockS3Client {
      send() { return Promise.resolve({}); }
    },
    PutObjectCommand: class MockPutObjectCommand {
      input: Record<string, unknown>;
      constructor(input: Record<string, unknown>) { this.input = input; }
    },
    GetObjectCommand: class MockGetObjectCommand {
      constructor(public input: Record<string, unknown>) {}
    },
  },
});

// ---------------------------------------------------------------------------
// Minimal in-memory fakes for DB and repositories.
// ---------------------------------------------------------------------------

let _chunks: Map<string, any> = new Map();
let _tracks: Map<string, any> = new Map();

function resetFakes() {
  _chunks = new Map();
  _tracks = new Map();
}

function seedChunk(chunk: any) { _chunks.set(chunk.id, chunk); }
function seedTrack(track: any) { _tracks.set(track.id, track); }

// We override the module-level prisma client by replacing its methods.
// The service imports prisma from '../lib/prisma.js' — we patch it here.
mock.module('./lib/prisma.js', {
  namedExports: {
    prisma: {
      recording: {
        findUnique: async ({ where }: any) => ({ id: where.id, userId: 'user-1' }),
      },
      track: {
        findUnique: async ({ where }: any) => _tracks.get(where.id) ?? null,
        update: async ({ where, data }: any) => {
          const t = _tracks.get(where.id);
          if (t) { Object.assign(t, data); _tracks.set(where.id, t); }
          return t;
        },
        findMany: async ({ where }: any) => {
          return Array.from(_tracks.values()).filter((t) => {
            if (where.recording_id && t.recording_id !== where.recording_id) return false;
            if (where.participant_id && t.participant_id !== where.participant_id) return false;
            return true;
          });
        },
      },
      track_chunk: {
        create: async ({ data }: any) => {
          const chunk = { ...data, id: `chunk-${data.seq}`, bytes_received: BigInt(0),
            tus_upload_id: null, tus_resource_url: null, tus_upload_state: null,
            failure_reason: null, last_error_at: null, materialized_at: null,
            storage_key_raw: null, etag: null, checksum_sha256: null,
            created_at: new Date(), updated_at: new Date() };
          _chunks.set(chunk.id, chunk);
          return chunk;
        },
      },
    },
  },
});

mock.module('./repositories/track-chunk.repo.js', {
  namedExports: {
    getTrackChunkById: async (id: string) => {
      const c = _chunks.get(id);
      if (!c) return null;
      const track = _tracks.get(c.track_id) ?? { recording_id: 'rec-1', participant_id: 'p-1' };
      return { ...c, track };
    },
    getTrackChunkByTrackSeq: async (trackId: string, seq: number) => {
      for (const c of _chunks.values()) {
        if (c.track_id === trackId && c.seq === seq) return c;
      }
      return null;
    },
    listTrackChunksByTrack: async (trackId: string) => {
      return Array.from(_chunks.values())
        .filter((c) => c.track_id === trackId)
        .sort((a, b) => a.seq - b.seq);
    },
    markTrackChunkUploaded: async ({ chunkId, storageKeyRaw, bytesReceived }: any) => {
      const c = _chunks.get(chunkId);
      if (!c) throw new Error(`Chunk not found: ${chunkId}`);
      Object.assign(c, {
        state: 'uploaded',
        storage_key_raw: storageKeyRaw,
        bytes_received: BigInt(bytesReceived ?? 0),
        materialized_at: new Date(),
        updated_at: new Date(),
      });
      _chunks.set(chunkId, c);
      return c;
    },
    markTrackChunkFailed: async ({ chunkId, reason }: any) => {
      const c = _chunks.get(chunkId);
      if (c) { c.state = 'failed'; c.failure_reason = reason; _chunks.set(chunkId, c); }
    },
    setTrackChunkTusRef: async () => {},
  },
});

mock.module('./services/recording-pipeline.service.js', {
  namedExports: {
    maybeEnqueueStitchJobForTrack: async () => {},
    maybeMarkRecordingProcessing: async () => {},
  },
});

mock.module('./lib/telemetry.js', {
  namedExports: { emitTelemetry: () => {} },
});

mock.module('./services/track-contiguity.service.js', {
  namedExports: {
    evaluateTrackUploadCompleteness: () => ({ complete: false }),
  },
});

mock.module('./lib/r2.js', {
  namedExports: {
    getR2Client: () => ({ send: async () => ({}) }),
    R2_BUCKET: 'test-bucket',
  },
});

// ---------------------------------------------------------------------------
// Import the services AFTER mocks are registered.
// ---------------------------------------------------------------------------
const { initiateTrackChunkService, completeTrackChunkService } = await import('./services/track-chunk.service.js');
const { validateRequiredEnv } = await import('./lib/validate-env.js');
const { resolveStorageKeyToLocal } = await import('./lib/storage.js');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const USER_PRINCIPAL = { kind: 'user' as const, userId: 'user-1' };

function makeTrack(overrides = {}) {
  return {
    id: 'track-1',
    recording_id: 'rec-1',
    participant_id: 'p-1',
    final_seq: null,
    capture_closed_at: null,
    track_chunk: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BRD-10: presigned URL chunk upload', () => {
  before(() => resetFakes());

  describe('A — initiateTrackChunkService: happy path', () => {
    it('returns presigned_url uploadPlan with url, key, expiresAt', async () => {
      resetFakes();
      seedTrack(makeTrack());

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
      const expiresMs = new Date(uploadPlan.expiresAt).getTime();
      assert.ok(expiresMs > Date.now(), 'expiresAt must be in the future');
    });
  });

  describe('D — initiateTrackChunkService: already uploaded', () => {
    it('returns already:true and no uploadPlan when chunk is uploaded', async () => {
      resetFakes();
      seedTrack(makeTrack());
      seedChunk({
        id: 'chunk-1', track_id: 'track-1', seq: 1, state: 'uploaded',
        protocol: 'presigned_url', bytes_received: BigInt(1000), bytes_expected: BigInt(1000),
        failure_reason: null, last_error_at: null, materialized_at: new Date(),
        storage_key_raw: 'recordings/rec-1/tracks/track-1/chunks/1.webm',
        etag: null, checksum_sha256: null, created_at: new Date(), updated_at: new Date(),
        tus_upload_id: null, tus_resource_url: null, tus_upload_state: null,
      });

      const result = await initiateTrackChunkService({
        recordingId: 'rec-1',
        principal: USER_PRINCIPAL,
        body: { trackId: 'track-1', seq: 1, protocol: 'presigned_url' },
      });

      assert.equal(result.code, 'ok');
      assert.ok('data' in result);
      assert.equal(result.data.already, true);
      assert.equal(result.data.uploadPlan, undefined);
    });
  });

  describe('C — completeTrackChunkService: idempotent already-uploaded', () => {
    it('returns already:true when chunk state is already uploaded', async () => {
      resetFakes();
      seedTrack(makeTrack());
      const uploadedChunk = {
        id: 'chunk-1', track_id: 'track-1', seq: 1, state: 'uploaded',
        protocol: 'presigned_url', bytes_received: BigInt(1000), bytes_expected: BigInt(1000),
        failure_reason: null, last_error_at: null, materialized_at: new Date(),
        storage_key_raw: 'recordings/rec-1/tracks/track-1/chunks/1.webm',
        etag: null, checksum_sha256: null, created_at: new Date(), updated_at: new Date(),
        tus_upload_id: null, tus_resource_url: null, tus_upload_state: null,
      };
      seedChunk(uploadedChunk);

      const result = await completeTrackChunkService({
        recordingId: 'rec-1',
        chunkId: 'chunk-1',
        principal: USER_PRINCIPAL,
        body: {
          protocol: 'presigned_url',
          storageKeyRaw: 'recordings/rec-1/tracks/track-1/chunks/1.webm',
          bytesReceived: 1000,
        },
      });

      assert.equal(result.code, 'ok');
      assert.ok('data' in result);
      assert.equal(result.data.already, true);
    });
  });

  describe('A — completeTrackChunkService: marks chunk uploaded with R2 key', () => {
    it('accepts protocol:presigned_url and stores storageKeyRaw in DB', async () => {
      resetFakes();
      seedTrack(makeTrack());
      const chunk = {
        id: 'chunk-2', track_id: 'track-1', seq: 2, state: 'initiated',
        protocol: 'presigned_url', bytes_received: BigInt(0), bytes_expected: BigInt(2000),
        failure_reason: null, last_error_at: null, materialized_at: null,
        storage_key_raw: null, etag: null, checksum_sha256: null,
        created_at: new Date(), updated_at: new Date(),
        tus_upload_id: null, tus_resource_url: null, tus_upload_state: null,
      };
      seedChunk(chunk);

      const r2Key = 'recordings/rec-1/tracks/track-1/chunks/2.webm';
      const result = await completeTrackChunkService({
        recordingId: 'rec-1',
        chunkId: 'chunk-2',
        principal: USER_PRINCIPAL,
        body: { protocol: 'presigned_url', storageKeyRaw: r2Key, bytesReceived: 2000 },
      });

      assert.equal(result.code, 'ok');
      assert.ok('data' in result);
      assert.equal(result.data.chunk.state, 'uploaded');
      assert.equal(result.data.chunk.storageKeyRaw, r2Key);
      assert.equal(result.data.already, undefined);
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
        R2_BUCKET: 'test-bucket',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
        R2_ENDPOINT: 'https://abc.r2.cloudflarestorage.com',
      };
      const originals: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(vars)) {
        originals[k] = process.env[k];
        process.env[k] = v;
      }
      try {
        assert.doesNotThrow(() => validateRequiredEnv());
      } finally {
        for (const [k, v] of Object.entries(originals)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    });
  });

  describe('F — resolveStorageKeyToLocal: R2 key fallthrough', () => {
    it('recognises recordings/ keys as R2 keys', async () => {
      // resolveStorageKeyToLocal calls downloadR2ObjectToTmp for recordings/ keys
      // when no local file exists. We verify the isLikelyR2Key check works.
      const { isLikelyR2Key } = await import('./lib/storage.js');
      assert.equal(isLikelyR2Key('recordings/rec-1/tracks/t-1/chunks/1.webm'), true);
      assert.equal(isLikelyR2Key('local/some/path.webm'), false);
      assert.equal(isLikelyR2Key(null), false);
    });
  });
});
