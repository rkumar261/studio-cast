import { api } from '@/lib/http';

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

export type ListExportsResponse = {
  recordingId: string;
  exports: ExportDto[];
};

export type CreateExportResponse = {
  export: ExportDto;
};

export type GetExportResponse = {
  export: ExportDto;
  downloadUrl?: string;
};

export const ExportsAPI = {
  create: (recordingId: string, type: ExportType) =>
    api<CreateExportResponse>('/v1/exports', {
      method: 'POST',
      body: JSON.stringify({ recordingId, type }),
    }),

  listForRecording: (recordingId: string) =>
    api<ListExportsResponse>(`/v1/recordings/${recordingId}/exports`),

  getById: (exportId: string) => api<GetExportResponse>(`/v1/exports/${exportId}`),
};
