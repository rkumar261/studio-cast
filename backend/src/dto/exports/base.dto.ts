export type ExportType = 'wav' | 'mp4' | 'mp4_captions';

export type ExportState = 'queued' | 'running' | 'succeeded' | 'failed';

export type ExportDto = {
    id: string;
    recordingId: string;
    type: ExportType;
    state: ExportState;
    storageKey?: string;
    lastError?: string;
    createdAt: string;
    updatedAt: string;
};
