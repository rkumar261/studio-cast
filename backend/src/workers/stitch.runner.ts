import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';

import { ffprobeJson } from '../lib/ffmpeg.js';
import { resolveStorageKeyToLocal, uploadFinalToR2 } from '../lib/storage.js';

/**
 * Binary-concatenate WebM streaming chunks into a single file.
 *
 * MediaRecorder writes the EBML/WebM header (tracks, codec info, etc.) ONLY in
 * the first chunk. All subsequent chunks are raw Cluster continuation blocks with
 * no header — they are NOT valid standalone WebM files. ffmpeg's concat demuxer
 * treats each input as an independent file, fails to parse chunks 2+ (no EBML),
 * and silently drops them, producing output that is only as long as the first chunk.
 *
 * Byte-appending the chunks reconstructs the original streaming WebM that
 * MediaRecorder intended to produce. The cluster timestamps in chunks 2+ are
 * cumulative from recording start (4s, 8s, …), so the concatenated file has
 * monotonically increasing timestamps and ffmpeg can transcode it correctly.
 */
async function binaryConcatChunks(chunkPaths: string[], outputPath: string): Promise<void> {
  const writeStream = createWriteStream(outputPath);
  for (const chunkPath of chunkPaths) {
    await pipeline(createReadStream(chunkPath), writeStream, { end: false });
  }
  await new Promise<void>((resolve, reject) => {
    writeStream.end((err?: Error | null) => (err ? reject(err) : resolve()));
  });
}

type StitchChunk = {
  seq: number;
  storageKeyRaw: string;
};

export type StitchOutcome = {
  rawKey: string;
  bytes: number;
  chunkCount: number;
};

function pickExtensionFromKey(storageKey: string): string {
  const parsed = path.extname(storageKey || '').toLowerCase();
  if (!parsed) return '.webm';
  return parsed;
}

export async function runStitchForTrack(args: {
  recordingId: string;
  trackId: string;
  chunks: StitchChunk[];
}): Promise<StitchOutcome> {
  const { recordingId, trackId, chunks } = args;

  if (!chunks.length) {
    throw new Error('stitch_no_chunks');
  }

  const chunkLocals: Array<{ localPath: string; cleanup: () => Promise<void> }> = [];
  const ext = pickExtensionFromKey(chunks[0]?.storageKeyRaw ?? '');
  const stitchedTmpPath = path.join(os.tmpdir(), `studio-cast-stitched-${trackId}-${Date.now()}${ext}`);

  try {
    for (const chunk of chunks) {
      const resolved = await resolveStorageKeyToLocal(chunk.storageKeyRaw);
      chunkLocals.push(resolved);
    }

    await binaryConcatChunks(
      chunkLocals.map((c) => c.localPath),
      stitchedTmpPath,
    );

    const stat = await fs.stat(stitchedTmpPath);
    if (!stat.size) {
      throw new Error('stitch_empty_output');
    }

    // Validate the stitched file is a parseable media container before uploading.
    const stitchProbe = await ffprobeJson(stitchedTmpPath);
    if (!stitchProbe.streams?.length) {
      throw new Error('stitch_invalid_output: no streams detected in stitched file');
    }

    const rawKey = `recordings/${recordingId}/tracks/${trackId}/raw/stitched${ext}`;

    await uploadFinalToR2(stitchedTmpPath, rawKey, 'application/octet-stream');

    return {
      rawKey,
      bytes: Number(stat.size),
      chunkCount: chunks.length,
    };
  } finally {
    for (const chunkLocal of chunkLocals) {
      try {
        await chunkLocal.cleanup();
      } catch {
        // Ignore cleanup failures for temp chunk paths.
      }
    }

    try {
      await fs.unlink(stitchedTmpPath);
    } catch {
      // Ignore stitched temp cleanup failures.
    }
  }
}
