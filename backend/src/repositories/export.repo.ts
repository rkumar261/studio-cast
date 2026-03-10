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
    scope?: {
        combinedAssetId?: string | null;
        participantAssetId?: string | null;
    },
) {
    return prisma.export_artifact.findFirst({
        where: {
            recording_id: recordingId,
            type,
            ...(scope?.combinedAssetId
                ? { combined_asset_id: scope.combinedAssetId }
                : {}),
            ...(scope?.participantAssetId
                ? { participant_asset_id: scope.participantAssetId }
                : {}),
            state: { in: [export_state.queued, export_state.running, export_state.succeeded] },
        },
        orderBy: { created_at: 'asc' },
    });
}

export function createExportArtifact(
    recordingId: string,
    type: export_type,
    scope?: {
        combinedAssetId?: string | null;
        participantAssetId?: string | null;
    },
) {
    return prisma.export_artifact.create({
        data: {
            recording_id: recordingId,
            type,
            state: export_state.queued,
            combined_asset_id: scope?.combinedAssetId ?? null,
            participant_asset_id: scope?.participantAssetId ?? null,
        },
    });
}

export function findExportById(id: string) {
    return prisma.export_artifact.findUnique({
        where: { id },
    });
}
