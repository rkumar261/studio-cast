import type { ExportType, ExportDto } from './base.dto.js';

export type CreateExportBody = {
    recordingId: string;
    type: ExportType;
};

export type CreateExportResponse = {
    export: ExportDto;
};
