import { prisma } from '../lib/prisma.js';

export function listTranscriptSegmentsByRecordingId(recordingId: string) {
    return prisma.transcript_segment.findMany({
        where: { recording_id: recordingId },
        orderBy: [
            { track_id: 'asc' },
            { start_ms: 'asc' },
        ],
    });
}
