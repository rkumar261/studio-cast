import path from 'node:path';
import fsp from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import OpenAI from 'openai';
import { downloadR2ObjectToTmp } from '../lib/storage.js';

const execFileAsync = promisify(execFile);

export type AsrSegment = {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
  confidence?: number;
};

// Whisper API max file size is 25MB
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

// Split large files into 10-minute chunks
const CHUNK_DURATION_SEC = 10 * 60;

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY env var is not set — cannot run ASR');
  }
  return new OpenAI({ apiKey });
}

type WhisperSegment = {
  start: number;
  end: number;
  text: string;
  no_speech_prob?: number;
};

async function transcribeLocalFileSimple(
  filePath: string,
  language?: string
): Promise<WhisperSegment[]> {
  const openai = getOpenAI();
  const fileBuffer = await fsp.readFile(filePath);
  const fileName = path.basename(filePath);

  const response = await openai.audio.transcriptions.create({
    file: await OpenAI.toFile(fileBuffer, fileName),
    model: 'whisper-1',
    response_format: 'verbose_json',
    ...(language ? { language } : {}),
  });

  const typed = response as unknown as { segments?: WhisperSegment[] };
  return typed.segments ?? [];
}

async function splitChunk(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number
): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', String(startSec),
    '-t', String(durationSec),
    '-i', inputPath,
    '-c', 'copy',
    outputPath,
  ]);
}

async function transcribeInChunks(
  filePath: string,
  durationMs: number,
  language?: string
): Promise<WhisperSegment[]> {
  const totalSec = durationMs / 1000;
  const numChunks = Math.ceil(totalSec / CHUNK_DURATION_SEC);
  const allSegments: WhisperSegment[] = [];
  const ext = path.extname(filePath) || '.webm';
  const base = filePath.replace(/\.[^.]+$/, '');

  for (let i = 0; i < numChunks; i++) {
    const startSec = i * CHUNK_DURATION_SEC;
    const chunkPath = `${base}.chunk${i}${ext}`;

    try {
      await splitChunk(filePath, chunkPath, startSec, CHUNK_DURATION_SEC);
      const segments = await transcribeLocalFileSimple(chunkPath, language);
      // Offset timestamps by chunk start
      allSegments.push(
        ...segments.map((s) => ({
          ...s,
          start: s.start + startSec,
          end: s.end + startSec,
        }))
      );
    } finally {
      await fsp.unlink(chunkPath).catch(() => {});
    }
  }

  return allSegments;
}

export async function runAsrForTrack(opts: {
  sourceStorageKey: string;
  sourceType?: 'track' | 'participant_asset' | 'combined_asset';
  durationMs?: number | null;
  language?: string;
}): Promise<{ segments: AsrSegment[] }> {
  const { sourceStorageKey, durationMs, language } = opts;

  // Download from R2 to a temp file
  const { localPath, cleanup } = await downloadR2ObjectToTmp(sourceStorageKey);

  try {
    const stat = await fsp.stat(localPath);
    let rawSegments: WhisperSegment[];

    if (stat.size <= WHISPER_MAX_BYTES) {
      rawSegments = await transcribeLocalFileSimple(localPath, language);
    } else {
      // Large file — split into chunks
      const effectiveDurationMs = durationMs ?? stat.size / 20; // ~20 bytes/ms rough estimate fallback
      rawSegments = await transcribeInChunks(localPath, effectiveDurationMs, language);
    }

    const segments: AsrSegment[] = rawSegments
      .filter((s) => s.text.trim().length > 0)
      .map((s) => ({
        startMs: Math.round(s.start * 1000),
        endMs: Math.round(s.end * 1000),
        text: s.text.trim(),
        // Whisper whisper-1 does not provide diarization — speaker labels require a separate pass
        // TODO(diarization): wire speaker labels when Deepgram or pyannote replaces Whisper
        speaker: undefined,
        confidence: s.no_speech_prob != null ? Math.max(0, 1 - s.no_speech_prob) : undefined,
      }));

    return { segments };
  } finally {
    await cleanup();
  }
}
