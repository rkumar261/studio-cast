export type ConsumerRecordingState =
  | 'recording'
  | 'uploading'
  | 'upload complete'
  | 'processing'
  | 'ready'
  | 'action required';

export type ParticipantUploadProgressDto = {
  participantId: string;
  role: 'host' | 'guest' | string;
  displayName?: string;
  state: ConsumerRecordingState;
  progressPct: number;
  blockedReason?: string;
};

export type RecordingProgressSummaryDto = {
  participantsTotal: number;
  participantsComplete: number;
  participantsUploading: number;
  actionRequiredParticipants: number;
};

export type GetRecordingProgressResponse = {
  recordingId: string;
  studioState: ConsumerRecordingState;
  projectState: ConsumerRecordingState;
  session: {
    startedAt?: string;
    stoppedAt?: string;
    hostParticipantId?: string;
    controlVersion: number;
  };
  studio: {
    canOpenProject: boolean;
    keepPageOpen: boolean;
  };
  summary: RecordingProgressSummaryDto;
  participants: ParticipantUploadProgressDto[];
};
