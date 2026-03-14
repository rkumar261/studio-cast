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

export function getLatestTranscriptByRecordingId(recordingId: string) {
    return prisma.transcript.findFirst({
        where: { recording_id: recordingId },
        orderBy: [
            { revision: 'desc' },
            { updated_at: 'desc' },
        ],
    });
}

export function getLatestPublishedTranscriptByRecordingId(recordingId: string) {
    return prisma.transcript.findFirst({
        where: {
            recording_id: recordingId,
            state: 'ready',
            published_at: { not: null },
        },
        orderBy: [
            { revision: 'desc' },
            { updated_at: 'desc' },
        ],
    });
}

export function getLatestPublishedTranscriptBySourceAsset(args: {
    recordingId: string;
    sourceAssetId: string;
}) {
    return prisma.transcript.findFirst({
        where: {
            recording_id: args.recordingId,
            source_asset_id: args.sourceAssetId,
            state: 'ready',
            published_at: { not: null },
        },
        orderBy: [
            { revision: 'desc' },
            { updated_at: 'desc' },
        ],
    });
}

export function listTranscriptSegmentsByTranscriptId(transcriptId: string) {
    return prisma.transcript_segment.findMany({
        where: { transcript_id: transcriptId },
        orderBy: [
            { start_ms: 'asc' },
            { id: 'asc' },
        ],
    });
}
