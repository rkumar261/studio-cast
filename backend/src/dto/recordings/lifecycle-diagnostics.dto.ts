import type { CanonicalRecordingLifecycleState, CanonicalTrackLifecycleState } from '../../lib/lifecycle-state.js';

export type RecordingLifecycleDiagnosticsResponse = {
  recording: {
    id: string;
    status: string;
    lifecycleState: string;
    canonicalLifecycleState: CanonicalRecordingLifecycleState;
    startedAt?: string;
    stoppedAt?: string;
    uploadCompletedAt?: string;
    processingStartedAt?: string;
    readyAt?: string;
    failedAt?: string;
    failureReason?: string;
  };
  tracks: Array<{
    id: string;
    participantId: string;
    kind: string;
    state: string;
    lifecycleState: string;
    canonicalLifecycleState: CanonicalTrackLifecycleState;
    finalSeq?: number;
    highestExistingSeq: number;
    highestContiguousUploadedSeq: number;
    missingSeqs: number[];
    blockedReason?: string;
    captureClosedAt?: string;
    finalizedAt?: string;
    ingestReadyAt?: string;
    stitchedAt?: string;
    transcodedAt?: string;
    readyAt?: string;
    failedAt?: string;
    failureReason?: string;
  }>;
};
