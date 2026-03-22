import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { assertFfmpegAvailable, ffprobeJson, toSec } from '../lib/ffmpeg.js';
import { resolveStorageKeyToLocal, uploadFinalToR2 } from '../lib/storage.js';

export type CombinedCompositionMode = 'side_by_side' | 'concat_all' | 'primary_only';

export type CombinedCompositionSource = {
  id: string;
  storageKey: string;
  /** Optional separate audio-only track to merge into the video source. */
  audioStorageKey?: string;
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

async function runFfmpegMergeAudio(videoPath: string, audioPath: string, outputPath: string) {
  const args = [
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    // No -shortest: video is the canonical length. If audio is shorter (e.g. fewer chunks
    // stitched), ffmpeg fills the remainder with silence rather than cutting the video.
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
      reject(new Error(`ffmpeg audio merge failed: ${stderr}`));
    });
  });
}

/**
 * Side-by-side layout using ffmpeg hstack (2 participants) or xstack grid (3-4).
 * Each video is scaled to a consistent height (480px) before being tiled so that
 * participants with different resolutions don't produce a ragged grid.
 * Audio from all participants is mixed with amix (normalize=0 keeps individual
 * levels stable as participant count grows).
 * Inputs without audio streams get synthetic silence via anullsrc so amix always
 * receives N inputs — participant master MP4s are often video-only.
 * Falls back to concat_all for 5+ participants.
 */
async function runFfmpegSideBySide(processedPaths: string[], outputPath: string): Promise<void> {
  const n = processedPaths.length;
  if (n === 0) throw new Error('side_by_side_no_sources');

  const inputs = processedPaths.flatMap((p) => ['-i', p]);

  // Scale each input to a consistent height while preserving aspect ratio.
  // -2 ensures the computed width is divisible by 2 (required by libx264).
  // Fixed tile dimensions ensure all participants have identical size before stacking.
  // Using scale+pad (letterbox) avoids aspect-ratio mismatches that cause hstack/vstack
  // to fail with "Input link has a different width/height" when sources differ in AR.
  const TILE_W = 640;
  const TILE_H = 360;
  const scaleFilters = processedPaths
    .map(
      (_, i) =>
        `[${i}:v]scale=${TILE_W}:${TILE_H}:force_original_aspect_ratio=decrease,` +
        `pad=${TILE_W}:${TILE_H}:(ow-iw)/2:(oh-ih)/2[sv${i}]`
    )
    .join(';');

  // Build the tile layout.
  let videoFilter: string;
  if (n === 2) {
    videoFilter = `${scaleFilters};[sv0][sv1]hstack=inputs=2[v]`;
  } else if (n === 3) {
    // 2 top, 1 bottom-centre — pad bottom to match top row width (TILE_W*2).
    // Since all tiles are exactly TILE_W×TILE_H after scale+pad above, this arithmetic
    // is deterministic regardless of each participant's original aspect ratio.
    videoFilter = [
      scaleFilters,
      `[sv0][sv1]hstack=inputs=2[top]`,
      `[sv2]pad=${TILE_W * 2}:${TILE_H}:${TILE_W / 2}:0[bot]`,
      `[top][bot]vstack=inputs=2[v]`,
    ].join(';');
  } else if (n === 4) {
    videoFilter = [
      scaleFilters,
      `[sv0][sv1]hstack=inputs=2[row0]`,
      `[sv2][sv3]hstack=inputs=2[row1]`,
      `[row0][row1]vstack=inputs=2[v]`,
    ].join(';');
  } else {
    throw new Error(`side_by_side_unsupported_count:${n}`);
  }

  // Probe each source to detect which inputs actually have audio streams.
  // Participant master MP4s may be video-only; hard-coding [i:a:0] causes ffmpeg
  // to fail with "Stream specifier matches no streams".
  const audioFlags = await Promise.all(
    processedPaths.map(async (p) => {
      try {
        const probe = await ffprobeJson(p);
        return probe.streams?.some((s) => s.codec_type === 'audio') ?? false;
      } catch {
        return false;
      }
    })
  );
  const anyAudio = audioFlags.some(Boolean);

  // Build filter_complex with optional audio mixing.
  const mapArgs: string[] = ['-map', '[v]'];
  let filterComplex = videoFilter;

  if (anyAudio) {
    // For inputs without audio, inject silence via anullsrc so amix has exactly N inputs.
    const anullFilters = audioFlags
      .flatMap((hasAudio, i) =>
        hasAudio ? [] : [`anullsrc=channel_layout=stereo:sample_rate=44100[anull${i}]`]
      )
      .join(';');
    const audioInputs = audioFlags
      .map((hasAudio, i) => (hasAudio ? `[${i}:a:0]` : `[anull${i}]`))
      .join('');
    // duration=shortest: amix terminates when the shortest FINITE audio input ends.
    // anullsrc is infinite — using duration=longest would cause ffmpeg to hang forever
    // on any recording where at least one participant has no audio stream.
    const audioFilter = `${audioInputs}amix=inputs=${n}:duration=shortest:normalize=0[a]`;
    filterComplex = anullFilters
      ? `${videoFilter};${anullFilters};${audioFilter}`
      : `${videoFilter};${audioFilter}`;
    mapArgs.push('-map', '[a]');
  }

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    ...mapArgs,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    ...(anyAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
    '-movflags', '+faststart',
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg side_by_side failed: ${stderr.slice(-1500)}`));
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
  // side_by_side mode always re-encodes to H.264+AAC = .mp4.
  // For other modes (copy passthrough), inherit the source extension.
  const ext = args.mode === 'side_by_side' ? '.mp4' : pickExtensionFromKey(selectedSources[0]!.storageKey);
  const composedTmpPath = path.join(
    os.tmpdir(),
    `studio-cast-combined-${args.recordingId}-${Date.now()}${ext}`
  );
  const concatListPath = path.join(
    os.tmpdir(),
    `studio-cast-combined-concat-${args.recordingId}-${Date.now()}.txt`
  );
  const localSources: Array<{ localPath: string; cleanup: () => Promise<void> }> = [];
  const audioLocalSources: Array<{ localPath: string; cleanup: () => Promise<void> }> = [];
  const mergedTmpPaths: string[] = [];

  try {
    for (const source of selectedSources) {
      const resolved = await resolveStorageKeyToLocal(source.storageKey);
      localSources.push(resolved);
    }

    const needsAudioMerge = selectedSources.some((s) => s.audioStorageKey);
    const needsConcat = localSources.length > 1;
    if (needsAudioMerge || needsConcat) {
      await assertFfmpegAvailable();
    }

    // Build per-source processed paths, merging in audio where provided.
    const processedPaths: string[] = [];
    for (let i = 0; i < localSources.length; i++) {
      const src = localSources[i]!;
      const audioKey = selectedSources[i]!.audioStorageKey;
      if (audioKey) {
        const audioResolved = await resolveStorageKeyToLocal(audioKey);
        audioLocalSources.push(audioResolved);
        const mergedTmp = path.join(
          os.tmpdir(),
          `studio-cast-merge-${args.recordingId}-${i}-${Date.now()}.mp4`
        );
        mergedTmpPaths.push(mergedTmp);
        await runFfmpegMergeAudio(src.localPath, audioResolved.localPath, mergedTmp);
        processedPaths.push(mergedTmp);
      } else {
        processedPaths.push(src.localPath);
      }
    }

    if (processedPaths.length === 1) {
      await fs.copyFile(processedPaths[0]!, composedTmpPath);
    } else if (args.mode === 'side_by_side' && processedPaths.length <= 4) {
      // Side-by-side: all participants visible simultaneously in a tiled layout.
      await runFfmpegSideBySide(processedPaths, composedTmpPath);
    } else {
      // concat_all (or side_by_side fallback for 5+ participants):
      // place participants sequentially one after another.
      const concatList = processedPaths
        .map((p) => `file '${p.replace(/'/g, `'\\''`)}'`)
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
      try { await localSource.cleanup(); } catch { /* ignore */ }
    }
    for (const audioSrc of audioLocalSources) {
      try { await audioSrc.cleanup(); } catch { /* ignore */ }
    }
    for (const tmpPath of mergedTmpPaths) {
      try { await fs.unlink(tmpPath); } catch { /* ignore */ }
    }
    try { await fs.unlink(composedTmpPath); } catch { /* ignore */ }
    try { await fs.unlink(concatListPath); } catch { /* ignore */ }
  }
}
