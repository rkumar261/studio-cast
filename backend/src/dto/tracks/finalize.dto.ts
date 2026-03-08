export type FinalizeTrackBody = {
  finalSeq: number;
  captureClosedAt?: string;
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
