export type InitiateTrackChunkBody = {
  trackId: string;
  seq: number;
  protocol: 'tus' | 'multipart';
  bytesExpected?: number;
};

export type InitiateTrackChunkResponse = {
  status: 'existing' | 'accepted' | 'seq_mismatch';
  nextExpectedSeq: number;
  highestContiguousUploadedSeq: number;
  chunk?: {
    id: string;
    trackId: string;
    seq: number;
    protocol?: string;
    state: string;
    bytesExpected?: number;
    bytesReceived?: number;
    tusUploadId?: string;
    tusResourceUrl?: string;
    tusUploadState?: string;
    failureReason?: string;
    lastErrorAt?: string;
    materializedAt?: string;
    createdAt: string;
    updatedAt: string;
  };
  existed?: boolean;
  already?: boolean;
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
  resumeUploadPlan?: {
    protocol: 'tus';
    tusEndpoint: string;
    chunkId: string;
    tusId?: string;
    tusUrl?: string;
    tusResourceUrl?: string;
    tusUploadState?: string;
  };
  reconciliation?: {
    requestedSeq: number;
    reason: 'stale' | 'ahead';
  };
};
