/**
 * Regression tests for binary chunk concatenation in stitch.runner.ts
 *
 * Root cause (BRD-11): stitch.runner.ts previously used `ffmpeg -f concat -safe 0`,
 * which silently drops WebM chunks 2+ (no EBML header), producing output only as long
 * as the first chunk (~4s). Binary byte-concatenation is the correct fix.
 *
 * These tests use real temp files with arbitrary bytes — WebM format validity is
 * irrelevant to testing byte-concatenation correctness; ffmpeg handles that later.
 *
 * Uses jest.unstable_mockModule + dynamic import (required for ESM mocking).
 */

import { jest, beforeAll, afterEach, test, expect } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// jest.unstable_mockModule must be called before the module under test is imported.
// The mock functions are wired up in beforeAll below.
let mockResolveStorageKeyToLocal: jest.Mock;
let mockUploadFinalToR2: jest.Mock;

// Dynamic import of the module under test — populated in beforeAll.
let runStitchForTrack: (args: {
  recordingId: string;
  trackId: string;
  chunks: Array<{ seq: number; storageKeyRaw: string }>;
}) => Promise<{ rawKey: string; bytes: number; chunkCount: number }>;

beforeAll(async () => {
  mockResolveStorageKeyToLocal = jest.fn();
  mockUploadFinalToR2 = jest.fn();

  jest.unstable_mockModule('../../src/lib/storage.js', () => ({
    resolveStorageKeyToLocal: mockResolveStorageKeyToLocal,
    uploadFinalToR2: mockUploadFinalToR2,
    // Expose other exports as pass-through stubs so the module doesn't crash on import.
    resolveRawToLocal: jest.fn(),
    uploadRawToR2: jest.fn(),
    buildFinalKey: jest.fn(),
  }));

  const mod = await import('../../src/workers/stitch.runner.js');
  runStitchForTrack = mod.runStitchForTrack;
});

/** Write arbitrary bytes to a temp file; returns path + async cleanup. */
async function writeTempChunk(bytes: Buffer): Promise<{ localPath: string; cleanup: () => Promise<void> }> {
  const localPath = path.join(
    os.tmpdir(),
    `stitch-test-chunk-${Math.random().toString(36).slice(2)}.webm`
  );
  await fs.writeFile(localPath, bytes);
  return {
    localPath,
    cleanup: async () => {
      try { await fs.unlink(localPath); } catch { /* ignore */ }
    },
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

test('stitch runner: multi-chunk concat produces output equal to sum of all chunk bytes', async () => {
  const chunkContents = [
    Buffer.from('EBML_HEADER_CHUNK_1_DATA_ABCDEFGH'),   // simulated WebM header
    Buffer.from('CLUSTER_CHUNK_2_AAAABBBBCCCCDDDD'),
    Buffer.from('CLUSTER_CHUNK_3_EEEEFFFF11112222'),
    Buffer.from('CLUSTER_CHUNK_4_GGGGHHHH33334444'),
    Buffer.from('CLUSTER_CHUNK_5_IIIIJJJJ55556666'),
    Buffer.from('CLUSTER_CHUNK_6_KKKKLLLL77778888'),
    Buffer.from('CLUSTER_CHUNK_7_MMMMNNNN99990000'),
  ];
  const expectedTotalBytes = chunkContents.reduce((sum, buf) => sum + buf.length, 0);

  const chunkFiles = await Promise.all(chunkContents.map(writeTempChunk));
  let uploadedBytes = 0;

  try {
    let chunkIndex = 0;
    mockResolveStorageKeyToLocal.mockImplementation(async () => {
      const file = chunkFiles[chunkIndex++]!;
      return { localPath: file.localPath, cleanup: async () => {} };
    });
    mockUploadFinalToR2.mockImplementation(async (localPath: string) => {
      const stat = await fs.stat(localPath);
      uploadedBytes = stat.size;
    });

    const outcome = await runStitchForTrack({
      recordingId: 'rec-multi',
      trackId: 'track-multi',
      chunks: chunkContents.map((_, i) => ({
        seq: i + 1,
        storageKeyRaw: `recordings/rec-multi/tracks/track-multi/chunks/${i + 1}.webm`,
      })),
    });

    expect(outcome.chunkCount).toBe(7);
    expect(outcome.bytes).toBe(expectedTotalBytes);
    expect(uploadedBytes).toBe(expectedTotalBytes);
  } finally {
    await Promise.all(chunkFiles.map((f) => f.cleanup()));
  }
});

test('stitch runner: single chunk produces output identical to input', async () => {
  const content = Buffer.from('SINGLE_CHUNK_BYTES_ABCDEFGHIJKLMNOP');
  const chunkFile = await writeTempChunk(content);
  let uploadedBytes = 0;

  try {
    mockResolveStorageKeyToLocal.mockImplementation(async () => ({
      localPath: chunkFile.localPath,
      cleanup: async () => {},
    }));
    mockUploadFinalToR2.mockImplementation(async (localPath: string) => {
      const stat = await fs.stat(localPath);
      uploadedBytes = stat.size;
    });

    const outcome = await runStitchForTrack({
      recordingId: 'rec-single',
      trackId: 'track-single',
      chunks: [{ seq: 1, storageKeyRaw: 'recordings/rec-single/tracks/track-single/chunks/1.webm' }],
    });

    expect(outcome.chunkCount).toBe(1);
    expect(outcome.bytes).toBe(content.length);
    expect(uploadedBytes).toBe(content.length);
  } finally {
    await chunkFile.cleanup();
  }
});

test('stitch runner: empty chunks array throws stitch_no_chunks', async () => {
  await expect(
    runStitchForTrack({
      recordingId: 'rec-empty',
      trackId: 'track-empty',
      chunks: [],
    })
  ).rejects.toThrow('stitch_no_chunks');
});
