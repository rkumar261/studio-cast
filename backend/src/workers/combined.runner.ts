import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { assertFfmpegAvailable, ffprobeJson, toSec } from '../lib/ffmpeg.js';
import { resolveStorageKeyToLocal, uploadFinalToR2 } from '../lib/storage.js';

export type CombinedCompositionMode = 'concat_all' | 'primary_only';

export type CombinedCompositionSource = {
  id: string;
  storageKey: string;
};

export type CombinedCompositionOutcome = {
  storageKey: string;
  previewKey: string;
  durationMs?: number;
  resolution?: string;
  exportSet: string[];
  mode: CombinedCompositionMode;
  sourceAssetIds: string[];
};

function pickExtensionFromKey(storageKey: string): string {
  const parsed = path.extname(storageKey || '').toLowerCase();
  if (!parsed) return '.mp4';
  return parsed;
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
      reject(new Error(`ffmpeg combined concat failed: ${stderr}`));
    });
  });
}

export async function runCombinedComposition(args: {
  recordingId: string;
  mode: CombinedCompositionMode;
  sources: CombinedCompositionSource[];
}): Promise<CombinedCompositionOutcome> {
  if (!args.sources.length) {
    throw new Error('combined_no_sources');
  }

  const selectedSources =
    args.mode === 'primary_only' ? [args.sources[0]!] : args.sources;
  const ext = pickExtensionFromKey(selectedSources[0]!.storageKey);
  const composedTmpPath = path.join(
    os.tmpdir(),
    `studio-cast-combined-${args.recordingId}-${Date.now()}${ext}`
  );
  const concatListPath = path.join(
    os.tmpdir(),
    `studio-cast-combined-concat-${args.recordingId}-${Date.now()}.txt`
  );
  const localSources: Array<{ localPath: string; cleanup: () => Promise<void> }> = [];

  try {
    for (const source of selectedSources) {
      const resolved = await resolveStorageKeyToLocal(source.storageKey);
      localSources.push(resolved);
    }

    if (localSources.length === 1) {
      await fs.copyFile(localSources[0]!.localPath, composedTmpPath);
    } else {
      await assertFfmpegAvailable();
      const concatList = localSources
        .map((source) => `file '${source.localPath.replace(/'/g, `'\\''`)}'`)
        .join('\n');
      await fs.writeFile(concatListPath, `${concatList}\n`, 'utf8');
      await runFfmpegConcat(concatListPath, composedTmpPath);
    }

    const stat = await fs.stat(composedTmpPath);
    if (!stat.size) throw new Error('combined_empty_output');

    const storageKey = `recordings/${args.recordingId}/combined/all-participants${ext}`;
    const contentType =
      ext === '.wav' ? 'audio/wav' : ext === '.mp4' ? 'video/mp4' : 'application/octet-stream';
    await uploadFinalToR2(composedTmpPath, storageKey, contentType);

    const probe = await ffprobeJson(composedTmpPath).catch(() => null);
    const videoStream = probe?.streams?.find((stream) => stream.codec_type === 'video');
    const durationSec = toSec(probe?.format?.duration) ?? toSec(videoStream?.duration);
    const durationMs =
      typeof durationSec === 'number' && Number.isFinite(durationSec)
        ? Math.round(durationSec * 1000)
        : undefined;
    const resolution =
      typeof videoStream?.width === 'number' && typeof videoStream?.height === 'number'
        ? `${videoStream.width}x${videoStream.height}`
        : undefined;

    return {
      storageKey,
      previewKey: storageKey,
      durationMs,
      resolution,
      exportSet: ['mp4', 'wav', 'mp4_captions'],
      mode: args.mode,
      sourceAssetIds: selectedSources.map((source) => source.id),
    };
  } finally {
    for (const localSource of localSources) {
      try {
        await localSource.cleanup();
      } catch {
        // ignore cleanup failures for local source temp paths
      }
    }

    try {
      await fs.unlink(composedTmpPath);
    } catch {
      // ignore composed temp cleanup failures
    }

    try {
      await fs.unlink(concatListPath);
    } catch {
      // ignore concat-list temp cleanup failures
    }
  }
}
