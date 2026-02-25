export type InitiateTrackChunkBody = {
  trackId: string;
  seq: number;
  protocol: 'tus' | 'multipart';
  bytesExpected?: number;
};

export type InitiateTrackChunkResponse = {
  chunk: {
    id: string;
    trackId: string;
    seq: number;
    protocol?: string;
    state: string;
    bytesExpected?: number;
    createdAt: string;
    updatedAt: string;
  };
  existed: boolean;
  uploadPlan?: {
    protocol: 'tus';
    tusEndpoint: string;
    metadata: {
      chunkId: string;
      recordingId: string;
      trackId: string;
      seq: string;
    };
  };
};
