import { export_type } from '@prisma/client';
import { listTranscriptSegmentsByRecordingId } from '../repositories/transcript.repo.js';

export type CaptionRenderOpts = {
  recordingId: string;
  exportType: export_type;        // should be mp4_captions here
  sourceStorageKey: string;       // video file to burn captions into
};

/**
 * Core captions entry point for exports.
 *
 * Later we'll:
 *  - fetch transcript segments for the recording
 *  - build an SRT/ASS stream or FFmpeg filter graph
 *  - run FFmpeg to burn subtitles into the video
 *  - upload the new file and return its storage key
 */
export async function renderCaptionsExportForRecording(
  opts: CaptionRenderOpts,
): Promise<{ finalKey: string }> {
  const { recordingId, exportType, sourceStorageKey } = opts;

  // Only relevant for mp4_captions right now
  if (exportType !== 'mp4_captions') {
    return { finalKey: sourceStorageKey };
  }

  // Load transcript segments
  const segments = await listTranscriptSegmentsByRecordingId(recordingId);

  // TEMP: we’re not actually generating/burning subtitles yet.
  // This is just the hook. You’ll later:
  //  - map `segments` into SRT/ASS
  //  - run FFmpeg with subtitles filter
  //  - upload to R2/S3 and return new key.
  // For now, just return the original key to keep behavior simple.
  void segments; // avoid unused variable for now

  return { finalKey: sourceStorageKey };
}
