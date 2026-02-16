import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { export_type } from '@prisma/client';
import { assertFfmpegAvailable } from '../lib/ffmpeg.js';
import { resolveStorageKeyToLocal, uploadFinalToR2 } from '../lib/storage.js';

export async function renderStandardExportForRecording(args: {
  recordingId: string;
  exportType: 'wav' | 'mp4';
  sourceStorageKey: string;
}): Promise<{ finalKey: string }> {
  const { recordingId, exportType, sourceStorageKey } = args;

  const source = await resolveStorageKeyToLocal(sourceStorageKey);
  const ext = exportType === export_type.wav ? '.wav' : '.mp4';
  const outputPath = path.join(
    os.tmpdir(),
    `studio-cast-${recordingId}-${exportType}-${Date.now()}${ext}`
  );
  const finalKey = `recordings/${recordingId}/exports/${exportType}/${randomUUID()}${ext}`;

  try {
    await assertFfmpegAvailable();
    await renderExportFile(exportType, source.localPath, outputPath);
    await uploadFinalToR2(
      outputPath,
      finalKey,
      exportType === export_type.wav ? 'audio/wav' : 'video/mp4'
    );
    return { finalKey };
  } finally {
    await source.cleanup().catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

async function renderExportFile(
  exportType: 'wav' | 'mp4',
  inputPath: string,
  outputPath: string
) {
  if (exportType === export_type.wav) {
    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-vn',
      '-ac', '1',
      '-ar', '48000',
      '-sample_fmt', 's16',
      outputPath,
    ]);
    return;
  }

  try {
    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath,
    ]);
  } catch {
    // Audio-only fallback for sources with no video stream.
    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-vn',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath,
    ]);
  }
}

async function runFfmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg standard export failed: ${stderr}`));
    });
  });
}
