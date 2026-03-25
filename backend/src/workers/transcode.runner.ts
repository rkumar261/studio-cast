import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
    assertFfmpegAvailable,
    ffprobeJson,
    isAudioOnlyProbe,
    toSec,
    transcodeAudio,
    transcodeVideo,
    type ProbeResult,
} from '../lib/ffmpeg.js';

import {
    resolveRawToLocal,
    uploadFinalToR2,
    buildFinalKey,
    type TrackLike,
} from '../lib/storage.js';

export type QualityWarnings = {
    audioWarning?: 'no_audio_stream';
    videoWarning?: 'black_video' | 'insufficient_frames';
};

export type TranscodeOutcome = {
    kind: 'audio' | 'video';
    finalKey: string;              // R2 key for the final artifact
    contentType: 'audio/wav' | 'video/mp4';
    probe: ProbeResult;            // ffprobe result of the RAW input
    durationSec?: number;
    width?: number;
    height?: number;
    qualityWarnings?: QualityWarnings;
};

/**
 * Given a Track-like record (must include storage_key_raw, recording_id, id),
 * transcode the RAW to a normalized final, upload to R2, and return metadata.
 *
 * This function is pure side-effect toward storage; it DOES NOT update the DB.
 * The worker calling this should persist finalKey/metadata and enqueue next jobs.
 */
export async function runTranscodeForTrack(
    track: TrackLike & { finalKeyOverride?: string }
): Promise<TranscodeOutcome> {
    if (!track?.storage_key_raw) {
        throw new Error(`runTranscodeForTrack: track ${track?.id} has no storage_key_raw`);
    }

    // Ensure ffmpeg/ffprobe are installed
    await assertFfmpegAvailable();

    //Resolve RAW to a local path
    const { localPath: rawLocal, cleanup: cleanupRaw } = await resolveRawToLocal(track);

    // Probe RAW
    const probe = await ffprobeJson(rawLocal);
    const audioOnly = isAudioOnlyProbe(probe);

    // Extract a few fields for convenience
    const vStream = (probe.streams || []).find((s) => s.codec_type === 'video');
    const durationSec = toSec(probe.format?.duration) ?? toSec(vStream?.duration);
    const width = vStream?.width;
    const height = vStream?.height;

    // Choose kind & final key
    const kind: 'audio' | 'video' = audioOnly ? 'audio' : 'video';
    const ext = kind === 'audio' ? '.wav' : '.mp4';
    const finalKey = track.finalKeyOverride ?? buildFinalKey(track.recording_id, track.id, kind, ext);
    const contentType: 'audio/wav' | 'video/mp4' =
        kind === 'audio' ? 'audio/wav' : 'video/mp4';

    // Transcode RAW → FINAL (temp file)
    const tmpFinal = path.join(process.cwd(), `.tmp-final-${track.id}${ext}`);
    try {
        if (kind === 'audio') {
            await transcodeAudio(rawLocal, tmpFinal);
        } else {
            await transcodeVideo(rawLocal, tmpFinal, {
                targetFps: 30,
                crf: 23,
                preset: 'medium',
                audioBitrateKbps: 128,
            });
        }

        // Probe the OUTPUT (not the raw input) — WebM from MediaRecorder has broken
        // container duration metadata (reflects only the first chunk, not the full recording).
        // The transcoded file always has correct duration because ffmpeg processes all frames.
        const outputProbe = await ffprobeJson(tmpFinal).catch(() => probe);
        const outputVStream = (outputProbe.streams || []).find((s) => s.codec_type === 'video');
        const outputDurationSec = toSec(outputProbe.format?.duration) ?? toSec(outputVStream?.duration) ?? durationSec;

        // Upload final to R2
        await uploadFinalToR2(tmpFinal, finalKey, contentType);

        // P4/P5: post-transcode quality probe
        const qualityWarnings: QualityWarnings = {};
        if (kind === 'video') {
            const hasAudio = outputProbe.streams?.some((s) => s.codec_type === 'audio') ?? false;
            if (!hasAudio) {
                qualityWarnings.audioWarning = 'no_audio_stream';
            }
            if (outputDurationSec != null) {
                if (outputDurationSec < 1.0) {
                    qualityWarnings.videoWarning = 'insufficient_frames';
                } else {
                    const bv = await checkBlackVideo(tmpFinal, outputDurationSec).catch(() => false);
                    if (bv) qualityWarnings.videoWarning = 'black_video';
                }
            }
        }

        // Return outcome (worker will persist)
        return {
            kind,
            finalKey,
            contentType,
            probe,
            durationSec: outputDurationSec,
            width: outputVStream?.width ?? width,
            height: outputVStream?.height ?? height,
            qualityWarnings: Object.keys(qualityWarnings).length > 0 ? qualityWarnings : undefined,
        };
    } finally {
        // cleanup temp files
        try { await fs.unlink(tmpFinal); } catch { }
        try { await cleanupRaw(); } catch { }
    }
}

/**
 * P5: Sample 3 frames (start, mid, near-end) via ffmpeg signalstats.
 * Returns true if ALL 3 frames have average luminance (YAVG) < 8 (< 3% brightness).
 * Guard: skip if duration < 1s.
 */
async function checkBlackVideo(filePath: string, durationSec: number): Promise<boolean> {
    const half = (durationSec / 2).toFixed(3);
    const end = (durationSec * 0.99).toFixed(3);
    const filter = `select='gte(t,0)+gte(t,${half})+gte(t,${end})',signalstats`;

    const args = [
        '-i', filePath,
        '-vf', filter,
        '-frames:v', '3',
        '-f', 'null',
        '-',
    ];

    const stderr = await new Promise<string>((resolve) => {
        const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let out = '';
        child.stderr.on('data', (d) => (out += String(d)));
        child.on('close', () => resolve(out));
        child.on('error', () => resolve(''));
    });

    // Parse YAVG values from signalstats output
    const yavgMatches = [...stderr.matchAll(/YAVG:([0-9.]+)/g)];
    if (yavgMatches.length === 0) return false;
    return yavgMatches.every((m) => Number(m[1]) < 8);
}
