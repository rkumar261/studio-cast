import type { GetTranscriptResponse, TranscriptSegmentDto } from '../dto/transcripts/get.dto.js';
import { listTranscriptSegmentsByRecordingId } from '../repositories/transcript.repo.js';
import { getRecordingService } from './recordings.service.js';

type GetTranscriptArgs = {
    recordingId: string;
    requesterId: string;
};

export type GetTranscriptResult =
    | { code: 'ok'; data: GetTranscriptResponse }
    | { code: 'not_found' | 'forbidden' };

export async function getTranscriptByRecordingIdService(
    args: GetTranscriptArgs,
): Promise<GetTranscriptResult> {
    const { recordingId, requesterId } = args;

    // reuse recording ACL
   const recResult = await getRecordingService({ id: recordingId, requesterId });

    if (recResult.code === 'not_found') {
        return { code: 'not_found' };
    }

    if (recResult.code === 'forbidden') {
        return { code: 'forbidden' };
    } 

    const rows = await listTranscriptSegmentsByRecordingId(recordingId);

    // if there are segments from multiple tracks, only keep the first track’s segments
    if (rows.length === 0) {
        return {
            code: 'ok',
            data: {
                recordingId,
                segments: [],
            },
        };
    }

    const primaryTrackId = rows[0].track_id; // rows are already ordered by track_id, start_ms

    const filteredRows = rows.filter((r) => r.track_id === primaryTrackId);

    const segments: TranscriptSegmentDto[] = filteredRows.map((s) => ({
        id: s.id,
        recordingId: s.recording_id,
        trackId: s.track_id,
        startMs: s.start_ms,
        endMs: s.end_ms,
        text: s.text,
        speaker: s.speaker,
        confidence: s.confidence ? Number(s.confidence) : null,
    }));

    const data: GetTranscriptResponse = {
        recordingId,
        segments,
    };

    return { code: 'ok', data };
}