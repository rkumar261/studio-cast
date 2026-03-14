export type ExportType = 'wav' | 'mp4' | 'mp4_captions';

export type ExportState = 'queued' | 'running' | 'succeeded' | 'failed';

export type ExportDto = {
    id: string;
    recordingId: string;
    type: ExportType;
    state: ExportState;
    combinedAssetId?: string;
    participantAssetId?: string;
    transcriptId?: string;
    lastError?: string;
    failureReason?: string;
    startedAt?: string;
    readyAt?: string;
    failedAt?: string;
    createdAt: string;
    updatedAt: string;
};
