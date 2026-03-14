export type GetRecordingResponse = {
  recording: {
    id: string;
    title?: string;
    status: string;
    createdAt: string; 
  };
  tracks: Array<{
    id: string;
    recordingId: string;
    participantId: string;
    kind: 'audio' | 'video';
    codec?: string;
    durationMs?: number;
    storageKeyRaw?: string;
    storageKeyFinal?: string;
    state: 'recording' | 'uploaded' | 'processed';
  }>;
  participantAssets: Array<{
    id: string;
    recordingId: string;
    participantId: string;
    participantRole?: string;
    participantName?: string;
    participantEmail?: string;
    state: 'pending' | 'processing' | 'ready' | 'failed';
    storageKey?: string;
    previewKey?: string;
    durationMs?: number;
    resolution?: string;
    processingStartedAt?: string;
    readyAt?: string;
    failedAt?: string;
    failureReason?: string;
    exportSet: string[];
    metadata?: Record<string, unknown>;
  }>;
  combinedAsset?: {
    id: string;
    recordingId: string;
    state: 'pending' | 'processing' | 'ready' | 'failed';
    storageKey?: string;
    previewKey?: string;
    durationMs?: number;
    resolution?: string;
    processingStartedAt?: string;
    readyAt?: string;
    failedAt?: string;
    failureReason?: string;
    exportSet: string[];
    metadata?: Record<string, unknown>;
  };
};
