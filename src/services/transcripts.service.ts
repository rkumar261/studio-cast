import type { GetTranscriptResponse, TranscriptSegmentDto } from '../dto/transcripts/get.dto.js';
import { listTranscriptSegmentsByRecordingId } from '../repositories/transcript.repo.js';
import { getRecordingService } from './recordings.service.js';

type GetTranscriptArgs = {
    recordingId: string;
    requesterId: string;
};

export type GetTranscriptResult =
    | { code: 'ok'; data: GetTranscriptResponse }
    | { code: 'not_found', data: null }
    | {code: 'forbidden', data: null }; 

export async function getTranscriptByRecordingIdService(
    args: GetTranscriptArgs,
): Promise<GetTranscriptResult> {
    const { recordingId, requesterId } = args;

    // reuse recording ACL
    const recResult = await getRecordingService({ id: recordingId, requesterId });

    if (recResult.code !== 'ok') {
        return { code: recResult.code, data: null }; // 'not_found' | 'forbidden'
    }

    const rows = await listTranscriptSegmentsByRecordingId(recordingId);

    const segments: TranscriptSegmentDto[] = rows.map((s) => ({
        id: s.id,
        recordingId: s.recording_id,
        trackId: s.track_id,
        startMs: s.start_ms,
        endMs: s.end_ms,
        text: s.text,
        speaker: s.speaker,
        confidence: s.confidence != null ? Number(s.confidence) : null,
    }));

    const data: GetTranscriptResponse = {
        recordingId,
        segments,
    };

    return { code: 'ok', data };
}
