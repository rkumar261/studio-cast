import type { ExportDto } from './base.dto.js';

export type ListExportsResponse = {
    recordingId: string;
    exports: ExportDto[];
};

export type GetExportResponse = {
    export: ExportDto;
    downloadUrl?: string;
};