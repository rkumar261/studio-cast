import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

import { resolveStorageKeyToLocal, uploadFinalToR2 } from '../lib/storage.js';
import { assertFfmpegAvailable } from '../lib/ffmpeg.js';

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
  const concatListPath = path.join(os.tmpdir(), `studio-cast-concat-${trackId}-${Date.now()}.txt`);

  try {
    for (const chunk of chunks) {
      const resolved = await resolveStorageKeyToLocal(chunk.storageKeyRaw);
      chunkLocals.push(resolved);
    }

    if (chunkLocals.length === 1) {
      await fs.copyFile(chunkLocals[0].localPath, stitchedTmpPath);
    } else {
      await assertFfmpegAvailable();
      const concatList = chunkLocals
        .map((chunkLocal) => `file '${chunkLocal.localPath.replace(/'/g, `'\\''`)}'`)
        .join('\n');

      await fs.writeFile(concatListPath, `${concatList}\n`, 'utf8');
      await runFfmpegConcat(concatListPath, stitchedTmpPath);
    }

    const stat = await fs.stat(stitchedTmpPath);
    if (!stat.size) {
      throw new Error('stitch_empty_output');
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

    try {
      await fs.unlink(concatListPath);
    } catch {
      // Ignore concat-list temp cleanup failures.
    }
  }
}

async function runFfmpegConcat(concatListPath: string, outputPath: string) {
  const args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg stitch concat failed: ${stderr}`));
    });
  });
}
