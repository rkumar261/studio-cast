import fs from 'node:fs/promises';
import path from 'node:path';

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

export type TranscodeOutcome = {
    kind: 'audio' | 'video';
    finalKey: string;              // R2 key for the final artifact
    contentType: 'audio/wav' | 'video/mp4';
    probe: ProbeResult;            // ffprobe result of the RAW input
    durationSec?: number;
    width?: number;
    height?: number;
};

/**
 * Given a Track-like record (must include storage_key_raw, recording_id, id),
 * transcode the RAW to a normalized final, upload to R2, and return metadata.
 *
 * This function is pure side-effect toward storage; it DOES NOT update the DB.
 * The worker calling this should persist finalKey/metadata and enqueue next jobs.
 */
export async function runTranscodeForTrack(track: TrackLike): Promise<TranscodeOutcome> {
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
    const finalKey = buildFinalKey(track.recording_id, track.id, kind, ext);
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

        // Upload final to R2
        await uploadFinalToR2(tmpFinal, finalKey, contentType);

        // Return outcome (worker will persist)
        return {
            kind,
            finalKey,
            contentType,
            probe,
            durationSec,
            width,
            height,
        };
    } finally {
        // cleanup temp files
        try { await fs.unlink(tmpFinal); } catch { }
        try { await cleanupRaw(); } catch { }
    }
}
