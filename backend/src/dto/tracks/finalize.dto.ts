export type FinalizeTrackBody = {
  finalSeq: number;
  captureClosedAt?: string;
  /** ISO timestamp of when the recording session started (for P2 duration sync). */
  recordingStartedAt?: string;
};

export type FinalizeTrackResponse = {
  track: {
    id: string;
    recordingId: string;
    finalSeq: number;
    captureClosedAt?: string;
    finalizeRequestedAt: string;
  };
};
