import type { recording_status } from '@prisma/client';

export type RecordingProgressPhase = 'recording' | 'uploading' | 'processing' | 'ready' | 'error';

export type TrackProgressDto = {
  trackId: string;
  kind: 'audio' | 'video' | 'screen';
  state: string;
  uploadState: string;
  protocol?: 'tus' | 'multipart';
  bytesReceived: number;
  updatedAt?: string;
};

export type ParticipantProgressDto = {
  participantId: string;
  role: 'host' | 'guest' | string;
  displayName?: string;
  trackCount: number;
  uploadedCount: number;
  processedCount: number;
  pendingCount: number;
  tracks: TrackProgressDto[];
};

export type RecordingProgressSummaryDto = {
  participantsTotal: number;
  participantsCompleted: number;
  tracksTotal: number;
  tracksUploaded: number;
  tracksProcessed: number;
  uploadsInProgress: number;
  uploadsCompleted: number;
  bytesReceived: number;
};

export type GetRecordingProgressResponse = {
  recordingId: string;
  status: recording_status;
  phase: RecordingProgressPhase;
  session: {
    startedAt?: string;
    stoppedAt?: string;
    hostParticipantId?: string;
    controlVersion: number;
  };
  summary: RecordingProgressSummaryDto;
  participants: ParticipantProgressDto[];
};
