import { prisma } from '../lib/prisma.js';
import { recording_status } from '@prisma/client';

export type RecordingCreateInput = {
    userId?: string | null;
    title?: string | null;
}

export async function createRecording(input: RecordingCreateInput) {

    const rec = await prisma.recording.create({
        data: {
            userId: input.userId ?? null,
            title: input.title ?? null,
            status: recording_status.draft,
        },
    });

    return rec;
}

export async function findRecordingById(id: string) {
    return prisma.recording.findUnique({
        where: { id },
    });
}

export async function listTrackByRecordingId(recordingId: string) {
    return prisma.track.findMany({ 
        where: { recording_id: recordingId },
        orderBy: { id: 'asc' },
    });
}

export async function listRecordingsByOwner(userId: string, limit: number, cursor?: string) {
    const rows = await prisma.recording.findMany({
        where: { userId },
        orderBy: { created_at: 'asc' },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })

    let nextCursor: string | undefined = undefined;

    if (rows.length > limit) {
        const nextItem = rows.pop();
        nextCursor = nextItem?.id;
    }

    return { rows, nextCursor };
}