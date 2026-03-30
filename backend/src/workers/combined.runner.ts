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
  /**
   * Seconds after the session start when this participant's recorder actually
   * began. Used to prepend black video + silence so all tiles are aligned to
   * the same session timeline. Defaults to 0 (no prepend).
   */
  startOffsetSec?: number;
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

/**
 * Concatenate multiple MP4/video files sequentially using filter_complex concat.
 * Unlike the concat demuxer with -c copy, this re-encodes each segment, which
 * resets timestamps at segment boundaries and avoids edit-list / timebase
 * discontinuities that cause skipping or broken seeking in the combined output.
 *
 * Audio-less inputs are padded with finite silence so concat filter doesn't fail.
 */
async function runFfmpegConcat(inputPaths: string[], outputPath: string) {
  const n = inputPaths.length;
  if (n === 0) throw new Error('concat_no_inputs');

  // Probe all inputs to determine which have audio streams.
  const probes = await Promise.all(
    inputPaths.map(async (p) => {
      try {
        const probe = await ffprobeJson(p);
        const hasAudio = probe.streams?.some((s) => s.codec_type === 'audio') ?? false;
        const durationSec = toSec(probe.format?.duration) ?? 0;
        return { hasAudio, durationSec };
      } catch {
        return { hasAudio: false, durationSec: 0 };
      }
    })
  );

  const anyAudio = probes.some((p) => p.hasAudio);
  const inputs = inputPaths.flatMap((p) => ['-i', p]);

  // Build filter_complex: for each input, ensure there's both a video and audio label.
  // Audio-less inputs get finite anullsrc silence matching their duration.
  const filterParts: string[] = [];
  const concatVideoLabels: string[] = [];
  const concatAudioLabels: string[] = [];

  for (let i = 0; i < n; i++) {
    const { hasAudio, durationSec } = probes[i]!;
    concatVideoLabels.push(`[v${i}]`);

    if (anyAudio) {
      if (hasAudio) {
        filterParts.push(`[${i}:a:0]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`);
      } else {
        // Finite silence for audio-less segment
        const dur = durationSec > 0 ? durationSec.toFixed(3) : '1.000';
        filterParts.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${dur},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`);
      }
      concatAudioLabels.push(`[a${i}]`);
    }
    filterParts.push(`[${i}:v:0]setpts=PTS-STARTPTS[v${i}]`);
  }

  const concatInputs = concatVideoLabels
    .map((vl, i) => `${vl}${anyAudio ? concatAudioLabels[i] : ''}`)
    .join('');
  const audioOut = anyAudio ? ':a=1' : ':a=0';
  filterParts.push(`${concatInputs}concat=n=${n}:v=1${audioOut}[outv]${anyAudio ? '[outa]' : ''}`);

  const filterComplex = filterParts.join(';');
  const mapArgs = ['-map', '[outv]', ...(anyAudio ? ['-map', '[outa]'] : [])];

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    ...mapArgs,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p',
    ...(anyAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
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
      reject(new Error(`ffmpeg combined concat failed: ${stderr.slice(-2000)}`));
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
 * Each video is scaled to a consistent height before being tiled.
 *
 * Duration correctness:
 * - All inputs are probed for their actual duration and whether they have audio.
 * - Shorter video inputs are extended with a frozen last frame (tpad) so hstack
 *   does not terminate early when the shortest participant's video ends.
 * - Audio inputs are padded with silence (apad) to the same length as the longest
 *   video so amix does not cut the combined audio short. Audio-less inputs get
 *   finite silence via atrim'd anullsrc instead of infinite anullsrc (which would
 *   hang amix with duration=longest).
 * - -shortest on the output encoding ensures the muxer terminates cleanly when
 *   the video stream ends, even if any padded stream extends slightly beyond.
 * Falls back to concat_all for 5+ participants.
 */
async function runFfmpegSideBySide(
  processedPaths: string[],
  outputPath: string,
  startOffsets?: number[]
): Promise<void> {
  const n = processedPaths.length;
  if (n === 0) throw new Error('side_by_side_no_sources');

  // Probe every input once — collect both audio presence and duration.
  const probes = await Promise.all(
    processedPaths.map(async (p) => {
      try {
        const probe = await ffprobeJson(p);
        const hasAudio = probe.streams?.some((s) => s.codec_type === 'audio') ?? false;
        const durationSec = toSec(probe.format?.duration) ?? 0;
        return { hasAudio, durationSec };
      } catch {
        return { hasAudio: false, durationSec: 0 };
      }
    })
  );
  const audioFlags = probes.map((p) => p.hasAudio);
  const anyAudio = audioFlags.some(Boolean);
  // Effective end time per source = startOffset + actualDuration.
  // padTarget is the reference length for the combined output.
  const effectiveEndTimes = probes.map((p, i) => (startOffsets?.[i] ?? 0) + p.durationSec);
  const maxEffectiveDuration = Math.max(...effectiveEndTimes, 0);
  // Small buffer so tpad/apad filters always cover the full video.
  const padTarget = maxEffectiveDuration + 0.5;

  const inputs = processedPaths.flatMap((p) => ['-i', p]);

  const TILE_W = 640;
  // For n=2: portrait tiles (640×720) so hstack → 1280×720 (16:9 standard output).
  // For n=3/4: landscape tiles (640×360) so vstack rows → 1280×720 (16:9).
  const tileH = n === 2 ? 720 : 360;

  // Scale each input to a consistent tile size.
  // - tpad start_duration: prepends black frames for participants who joined after
  //   the session started, aligning all tiles to the same session timeline.
  // - tpad stop_duration: extends short tiles with a frozen last frame so hstack
  //   never terminates early due to EOF from a shorter participant.
  const scaleFilters = probes
    .map(({ durationSec }, i) => {
      const startOffset = startOffsets?.[i] ?? 0;
      const stopShortfall = padTarget - (startOffset + durationSec);
      const startPart = startOffset > 0.01
        ? `start_duration=${startOffset.toFixed(3)}:start_mode=add:`
        : '';
      const stopPart = stopShortfall > 0.05
        ? `stop_mode=clone:stop_duration=${stopShortfall.toFixed(3)}`
        : `stop_mode=clone:stop_duration=0`;
      return (
        `[${i}:v]scale=${TILE_W}:${tileH}:force_original_aspect_ratio=decrease,` +
        `pad=${TILE_W}:${tileH}:(ow-iw)/2:(oh-ih)/2,` +
        `tpad=${startPart}${stopPart}[sv${i}]`
      );
    })
    .join(';');

  // Build the tile layout.
  let videoFilter: string;
  if (n === 2) {
    // Two portrait columns side by side → 1280×720 (16:9)
    videoFilter = `${scaleFilters};[sv0][sv1]hstack=inputs=2[v]`;
  } else if (n === 3) {
    videoFilter = [
      scaleFilters,
      `[sv0][sv1]hstack=inputs=2[top]`,
      `[sv2]pad=${TILE_W * 2}:${tileH}:${TILE_W / 2}:0[bot]`,
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

  // Build filter_complex with optional audio mixing.
  const mapArgs: string[] = ['-map', '[v]'];
  let filterComplex = videoFilter;

  if (anyAudio) {
    // For inputs WITH audio:
    // - adelay prepends silence equal to the participant's join offset so audio
    //   aligns to the session timeline (matches the tpad start prepend on video).
    // - apad extends to padTarget so amix doesn't terminate early.
    // For inputs WITHOUT audio: finite silence via atrim'd anullsrc (avoids the
    // infinite-source hang that occurs with duration=longest + bare anullsrc).
    const audioPreFilters = probes
      .map(({ hasAudio, durationSec }, i) => {
        const startOffset = startOffsets?.[i] ?? 0;
        const effectiveEnd = startOffset + durationSec;
        if (hasAudio) {
          const delayMs = Math.round(startOffset * 1000);
          const delayPart = delayMs > 50 ? `adelay=${delayMs}:all=1,` : '';
          const shortfall = padTarget - effectiveEnd;
          return shortfall > 0.05
            ? `[${i}:a:0]${delayPart}apad=whole_dur=${padTarget.toFixed(3)}[apad${i}]`
            : `[${i}:a:0]${delayPart}anull[apad${i}]`;
        }
        // Audio-less input: generate finite silence matching padTarget.
        return (
          `anullsrc=channel_layout=stereo:sample_rate=44100,` +
          `atrim=duration=${padTarget.toFixed(3)}[apad${i}]`
        );
      })
      .join(';');
    const audioMixRefs = probes.map((_, i) => `[apad${i}]`).join('');
    // duration=longest: amix now terminates at padTarget (all inputs are the same
    // finite length after the padding step above).
    const audioFilter = `${audioMixRefs}amix=inputs=${n}:duration=longest:normalize=0[a]`;
    filterComplex = `${videoFilter};${audioPreFilters};${audioFilter}`;
    mapArgs.push('-map', '[a]');
  }

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    ...mapArgs,
    // -shortest: terminate encoding when the shortest OUTPUT stream ends.
    // The video stream [v] ends at maxDurationSec (all tiles padded to that length).
    // Any padded audio that extends beyond maxDurationSec is silently dropped.
    '-shortest',
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
  // All composition modes now produce H.264+AAC MP4 output.
  // side_by_side and concat_all both re-encode; primary_only copies but wraps in mp4.
  const ext = '.mp4';
  const composedTmpPath = path.join(
    os.tmpdir(),
    `studio-cast-combined-${args.recordingId}-${Date.now()}${ext}`
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
        // Guard: runFfmpegMergeAudio requires a video stream in the source.
        // If the participant_asset has no video stream (e.g. audio-only track),
        // skip the merge and use the source as-is.
        const videoProbe = await ffprobeJson(src.localPath).catch(() => null);
        const hasVideo = videoProbe?.streams?.some((s) => s.codec_type === 'video') ?? false;
        if (!hasVideo) {
          processedPaths.push(src.localPath);
        } else {
          const mergedTmp = path.join(
            os.tmpdir(),
            `studio-cast-merge-${args.recordingId}-${i}-${Date.now()}.mp4`
          );
          mergedTmpPaths.push(mergedTmp);
          await runFfmpegMergeAudio(src.localPath, audioResolved.localPath, mergedTmp);
          processedPaths.push(mergedTmp);
        }
      } else {
        processedPaths.push(src.localPath);
      }
    }

    const startOffsets = selectedSources.map((s) => s.startOffsetSec ?? 0);

    if (processedPaths.length === 1) {
      await fs.copyFile(processedPaths[0]!, composedTmpPath);
    } else if (args.mode === 'side_by_side' && processedPaths.length <= 4) {
      // Side-by-side: all participants visible simultaneously in a tiled layout.
      await runFfmpegSideBySide(processedPaths, composedTmpPath, startOffsets);
    } else {
      // concat_all (or side_by_side fallback for 5+ participants):
      // place participants sequentially one after another.
      // Uses filter_complex concat (re-encodes) to reset timestamps at segment
      // boundaries — avoids edit-list / timebase discontinuities from -c copy.
      await runFfmpegConcat(processedPaths, composedTmpPath);
    }

    const stat = await fs.stat(composedTmpPath);
    if (!stat.size) throw new Error('combined_empty_output');

    const storageKey = `recordings/${args.recordingId}/combined/all-participants${ext}`;
    const contentType = 'video/mp4';
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
  }
}
