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
};
