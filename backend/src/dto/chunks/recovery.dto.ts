export type TrackChunkRecoveryResponse = {
  track: {
    id: string;
    recordingId: string;
    finalized: boolean;
  };
  recovery: {
    highestExistingSeq: number;
    highestContiguousUploadedSeq: number;
    nextExpectedSeq: number;
    nextSeq: number;
    incompleteChunks: Array<{
      id: string;
      seq: number;
      protocol?: string;
      state: string;
      bytesExpected?: number;
      bytesReceived: number;
      tusId?: string;
      tusUrl?: string;
      tusUploadState?: string;
      failureReason?: string;
      lastErrorAt?: string;
      updatedAt: string;
    }>;
    resumableTus?: {
      chunkId: string;
      seq: number;
      tusId: string;
      tusUrl?: string;
      tusUploadState?: string;
    };
  };
};
