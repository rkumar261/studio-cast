import { export_type } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { listTranscriptSegmentsByRecordingId } from '../repositories/transcript.repo.js';
import { assertFfmpegAvailable } from '../lib/ffmpeg.js';
import { resolveStorageKeyToLocal, uploadFinalToR2 } from '../lib/storage.js';

export type CaptionRenderOpts = {
  recordingId: string;
  exportType: export_type;        // should be mp4_captions here
  sourceStorageKey: string;       // video file to burn captions into
};

export async function renderCaptionsExportForRecording(
  opts: CaptionRenderOpts,
): Promise<{ finalKey: string }> {
  const { recordingId, exportType, sourceStorageKey } = opts;

  // Only relevant for mp4_captions right now
  if (exportType !== export_type.mp4_captions) {
    return { finalKey: sourceStorageKey };
  }

  // Load transcript segments and render subtitle burn-in output.
  const segments = await listTranscriptSegmentsByRecordingId(recordingId);
  if (segments.length === 0) {
    throw new Error('captions_no_transcript_segments');
  }

  const subtitlePath = path.join(os.tmpdir(), `studio-cast-${recordingId}-${Date.now()}.srt`);
  const outputPath = path.join(os.tmpdir(), `studio-cast-${recordingId}-${Date.now()}.mp4`);
  const finalKey = `recordings/${recordingId}/exports/mp4_captions/${randomUUID()}.mp4`;

  const source = await resolveStorageKeyToLocal(sourceStorageKey);

  try {
    await assertFfmpegAvailable();
    await fs.writeFile(subtitlePath, toSrt(segments), 'utf8');
    await burnInCaptions(source.localPath, subtitlePath, outputPath);
    await uploadFinalToR2(outputPath, finalKey, 'video/mp4');

    return { finalKey };
  } finally {
    await source.cleanup().catch(() => {});
    await fs.unlink(subtitlePath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

function toSrtTimestamp(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');
  return `${hh}:${mm}:${ss},${mmm}`;
}

function sanitizeCueText(text: string) {
  return text.replace(/\r/g, '').trim();
}

function toSrt(
  segments: Array<{
    start_ms: number;
    end_ms: number;
    text: string;
    speaker: string | null;
  }>
) {
  const ordered = [...segments].sort((a, b) => a.start_ms - b.start_ms);
  const blocks = ordered.map((segment, idx) => {
    const start = toSrtTimestamp(segment.start_ms);
    const end = toSrtTimestamp(Math.max(segment.end_ms, segment.start_ms + 200));
    const speakerPrefix = segment.speaker ? `${segment.speaker}: ` : '';
    const text = sanitizeCueText(`${speakerPrefix}${segment.text}`);

    return `${idx + 1}\n${start} --> ${end}\n${text}\n`;
  });

  return `${blocks.join('\n')}\n`;
}

function escapeForSubtitlesFilter(inputPath: string): string {
  return inputPath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

async function burnInCaptions(inputPath: string, subtitlePath: string, outputPath: string) {
  const subtitlesArg = `subtitles='${escapeForSubtitlesFilter(subtitlePath)}'`;

  const args = [
    '-y',
    '-i', inputPath,
    '-vf', subtitlesArg,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
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
      reject(new Error(`ffmpeg captions burn-in failed: ${stderr}`));
    });
  });
}
