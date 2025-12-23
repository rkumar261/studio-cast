// src/lib/ffmpeg.ts
import { spawn } from 'node:child_process';
import { once } from 'node:events';

export type ProbeStream = {
    codec_type?: 'audio' | 'video';
    codec_name?: string;
    width?: number;
    height?: number;
    sample_rate?: string;
    channels?: number;
    duration?: string; // seconds as string
};
export type ProbeFormat = {
    filename?: string;
    format_name?: string;
    duration?: string; // seconds as string
    size?: string;     // bytes as string
};
export type ProbeResult = {
    streams: ProbeStream[];
    format: ProbeFormat;
};

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: opts.cwd });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => (stderr += d));
        child.on('error', reject);
        child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    });
}

/**
 * Verify ffmpeg/ffprobe are callable. Throws with a readable error if not found.
 */
export async function assertFfmpegAvailable() {
    const probe = await run('ffprobe', ['-version']).catch((e) => ({ code: 127, stdout: '', stderr: String(e) }));
    const ffm = await run('ffmpeg', ['-version']).catch((e) => ({ code: 127, stdout: '', stderr: String(e) }));

    if (probe.code !== 0) {
        throw new Error(`ffprobe not found or not runnable. Install ffmpeg suite. stderr=${probe.stderr}`);
    }
    if (ffm.code !== 0) {
        throw new Error(`ffmpeg not found or not runnable. Install ffmpeg suite. stderr=${ffm.stderr}`);
    }
}

/**
 * ffprobe - prints JSON with format and streams
 */
export async function ffprobeJson(inputPath: string): Promise<ProbeResult> {
    const args = [
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        inputPath,
    ];
    const { code, stdout, stderr } = await run('ffprobe', args);
    if (code !== 0) throw new Error(`ffprobe failed: ${stderr || stdout}`);
    const json = JSON.parse(stdout);
    return json as ProbeResult;
}

/**
 * Transcode audio to WAV, 48 kHz, PCM s16le
 * (You can switch to AAC/M4A later; WAV is simplest for ASR.)
 */
export async function transcodeAudio(inputPath: string, outPath: string): Promise<void> {
    const args = [
        '-y',
        '-i', inputPath,
        '-vn',              // no video
        '-ac', '1',         // mono (or '2' for stereo)
        '-ar', '48000',     // 48 kHz
        '-sample_fmt', 's16',
        outPath,
    ];
    const { code, stderr } = await run('ffmpeg', args);
    if (code !== 0) throw new Error(`ffmpeg audio transcode failed: ${stderr}`);
}

/**
 * Transcode video to H.264 + AAC mp4, 30 fps cap, yuv420p
 */
export async function transcodeVideo(
    inputPath: string, 
    outPath: string, 
    opts?: {
        targetFps?: number;
        crf?: number;             // quality (lower = better); typical 18–28
        preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
        audioBitrateKbps?: number;
}) {
    const targetFps = opts?.targetFps ?? 30;
    const crf = opts?.crf ?? 23;
    const preset = opts?.preset ?? 'medium';
    const abr = String((opts?.audioBitrateKbps ?? 128)) + 'k';

    const args = [
        '-y',
        '-i', inputPath,
        // video
        '-map', '0:v:0?',
        '-r', String(targetFps),
        '-c:v', 'libx264',
        '-preset', preset,
        '-crf', String(crf),
        '-pix_fmt', 'yuv420p',
        // audio
        '-map', '0:a:0?',
        '-c:a', 'aac',
        '-b:a', abr,
        // faststart for web playback
        '-movflags', '+faststart',
        outPath,
    ];

    const { code, stderr } = await run('ffmpeg', args);
    if (code !== 0) throw new Error(`ffmpeg video transcode failed: ${stderr}`);
}

/**
 * Decide if an input is "audio-only" based on probe result
 */
export function isAudioOnlyProbe(p: ProbeResult): boolean {
    const hasVideo = (p.streams || []).some((s) => s.codec_type === 'video');
    return !hasVideo;
}

/**
 * Convert seconds (string or number) to number seconds
 */
export function toSec(v?: string | number): number | undefined {
    if (v == null) return undefined;
    const n = typeof v === 'string' ? Number(v) : v;
    return Number.isFinite(n) ? n : undefined;
}
