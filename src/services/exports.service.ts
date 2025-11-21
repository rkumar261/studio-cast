import { export_type } from '@prisma/client';
import type {
    CreateExportResponse,
} from '../dto/exports/create.dto.js';
import type {
    ListExportsResponse,
    GetExportResponse
} from '../dto/exports/get.dto.js';
import type {
    ExportDto,
} from '../dto/exports/base.dto.js';
import {
    createExportArtifact,
    findActiveExportForRecording,
    listExportsByRecordingId,
    findExportById
} from '../repositories/export.repo.js';
import { getRecordingService } from './recordings.service.js';
import { createJob } from '../repositories/job.repo.js';

type CreateExportArgs = {
    recordingId: string;
    type: export_type;
    requesterId: string;
};

type ListExportsArgs = {
    recordingId: string;
    requesterId: string;
};

type ServiceResult<T> =
    | { code: 'ok'; data: T }
    | { code: 'not_found'; data?: undefined }
    | { code: 'forbidden'; data?: undefined };

function mapExportRowToDto(row: any): ExportDto {
    return {
        id: row.id,
        recordingId: row.recording_id,
        type: row.type,
        state: row.state,
        storageKey: row.storage_key ?? undefined,
        lastError: row.last_error ?? undefined,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

export async function createExportService(
    args: CreateExportArgs,
): Promise<ServiceResult<CreateExportResponse>> {
    const { recordingId, type, requesterId } = args;

    // reuse ACL from recording service
    const recResult = await getRecordingService({ id: recordingId, requesterId });

    if (recResult.code === 'not_found') return { code: 'not_found' };
    if (recResult.code === 'forbidden') return { code: 'forbidden' };

    // idempotency: reuse existing export if any
    const existing = await findActiveExportForRecording(recordingId, type);
    const exportRow =
        existing ?? (await createExportArtifact(recordingId, type));

    // if we just created it, enqueue export job
    if (!existing) {
        await createJob(recordingId, 'export', {
            exportId: exportRow.id,
            type: exportRow.type,
        });
    }

    const dto: ExportDto = mapExportRowToDto(exportRow);

    return { code: 'ok', data: { export: dto } };
}

export async function listExportsService(
    args: ListExportsArgs,
): Promise<ServiceResult<ListExportsResponse>> {
    const { recordingId, requesterId } = args;

    const recResult = await getRecordingService({ id: recordingId, requesterId });

    if (recResult.code === 'not_found') return { code: 'not_found' };
    if (recResult.code === 'forbidden') return { code: 'forbidden' };

    const rows = await listExportsByRecordingId(recordingId);
    const exports = rows.map(mapExportRowToDto);

    return {
        code: 'ok',
        data: {
            recordingId,
            exports,
        },
    };
}

function buildExportDownloadUrl(storageKey?: string | null): string | undefined {
    if (!storageKey) return undefined;
    const base = process.env.R2_PUBLIC_BASE_URL; // or whatever env you use
    if (!base) return undefined;
    return `${base.replace(/\/$/, '')}/${storageKey}`;
}

type GetExportArgs = {
    exportId: string;
    requesterId: string;
};


export async function getExportService(
    args: GetExportArgs,
): Promise<ServiceResult<GetExportResponse>> {
    const { exportId, requesterId } = args;

    const artifact = await findExportById(exportId);
    if (!artifact) {
        return { code: 'not_found' };
    }

    // Reuse recording ACL: only owners (or allowed users) can see this export
    const recResult = await getRecordingService({
        id: artifact.recording_id,
        requesterId,
    });

    if (recResult.code === 'not_found') return { code: 'not_found' };
    if (recResult.code === 'forbidden') return { code: 'forbidden' };

    const dto = mapExportRowToDto(artifact);
    const downloadUrl = buildExportDownloadUrl(artifact.storage_key);

    return {
        code: 'ok',
        data: {
            export: dto,
            downloadUrl,
        },
    };
}