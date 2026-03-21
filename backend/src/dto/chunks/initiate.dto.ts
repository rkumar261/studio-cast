export type InitiateTrackChunkBody = {
  trackId: string;
  seq: number;
  protocol: 'presigned_url';
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
    failureReason?: string;
    lastErrorAt?: string;
    materializedAt?: string;
    createdAt: string;
    updatedAt: string;
  };
  existed?: boolean;
  already?: boolean;
  /** Present when the chunk needs to be uploaded. */
  uploadPlan?: {
    protocol: 'presigned_url';
    /** Presigned R2 PUT URL — valid for expiresAt. */
    url: string;
    /** Canonical R2 object key to pass back in completeChunk.storageKeyRaw. */
    key: string;
    /** ISO 8601 expiry time for the presigned URL. */
    expiresAt: string;
  };
  reconciliation?: {
    requestedSeq: number;
    reason: 'stale' | 'ahead';
  };
};
