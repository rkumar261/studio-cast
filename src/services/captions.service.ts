import { export_type } from '@prisma/client';
import { listTranscriptSegmentsByRecordingId } from '../repositories/transcript.repo.js';

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

  // Load transcript segments (we'll actually use these later)
  const segments = await listTranscriptSegmentsByRecordingId(recordingId);

  // TODO: map segments → SRT/ASS, run ffmpeg, upload, return new key.
  void segments; // keep TS happy for now

  // For now: no-op, just return the original processed video key
  return { finalKey: sourceStorageKey };
}
