import { prisma } from '../lib/prisma.js';
import { export_state, export_type } from '@prisma/client';

export function listExportsByRecordingId(recordingId: string) {
    return prisma.export_artifact.findMany({
        where: { recording_id: recordingId },
        orderBy: { created_at: 'asc' },
    });
}

export function findActiveExportForRecording(
    recordingId: string,
    type: export_type,
) {
    return prisma.export_artifact.findFirst({
        where: {
            recording_id: recordingId,
            type,
            state: { in: [export_state.queued, export_state.running, export_state.succeeded] },
        },
        orderBy: { created_at: 'asc' },
    });
}

export function createExportArtifact(recordingId: string, type: export_type) {
    return prisma.export_artifact.create({
        data: {
            recording_id: recordingId,
            type,
            state: export_state.queued,
        },
    });
}

export function findExportById(id: string) {
    return prisma.export_artifact.findUnique({
        where: { id },
    });
}