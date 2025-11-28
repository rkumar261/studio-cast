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

// NEW imports for signed R2 download URLs
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client, R2_BUCKET } from '../lib/r2.js';

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

// Derive a nice filename based on export type/ids
function filenameForExport(row: any): string {
    const base = `export-${row.recording_id}-${row.id}`;

    switch (row.type as export_type) {
        case 'wav':
            return `${base}.wav`;
        case 'mp4':
        case 'mp4_captions':
            return `${base}.mp4`;
        default:
            return base;
    }
}

// Build a signed R2 URL that forces the browser to download (attachment)
async function buildExportDownloadUrl(row: any): Promise<string | undefined> {
    if (!row.storage_key) return undefined;

    const r2 = getR2Client();

    const cmd = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: row.storage_key,
        // This header is what makes it show in the browser's download bar
        ResponseContentDisposition: `attachment; filename="${filenameForExport(row)}"`,
    });

    // 10 minutes expiry is usually plenty for a download link
    return getSignedUrl(r2, cmd, { expiresIn: 600 });
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
    const downloadUrl = await buildExportDownloadUrl(artifact);

    return {
        code: 'ok',
        data: {
            export: dto,
            downloadUrl,
        },
    };
}
