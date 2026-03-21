export type CompleteTrackChunkBody = {
  protocol: 'presigned_url';
  bytesReceived?: number;
  /** R2 object key returned in the uploadPlan from initiateChunk. */
  storageKeyRaw: string;
  etag?: string;
  checksumSha256?: string;
};

export type CompleteTrackChunkResponse = {
  chunk: {
    id: string;
    trackId: string;
    seq: number;
    protocol?: string;
    state: string;
    bytesReceived: number;
    bytesExpected?: number;
    storageKeyRaw?: string;
    failureReason?: string;
    lastErrorAt?: string;
    materializedAt?: string;
    etag?: string;
    checksumSha256?: string;
    createdAt: string;
    updatedAt: string;
  };
  already?: boolean;
  nextExpectedSeq?: number;
  highestContiguousUploadedSeq?: number;
};
