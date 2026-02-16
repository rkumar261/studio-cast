import type { export_type, recording_status } from '@prisma/client';

export type RecordingProgressPhase = 'recording' | 'uploading' | 'processing' | 'ready' | 'error';

export type TrackProgressDto = {
  trackId: string;
  kind: 'audio' | 'video' | 'screen';
  state: string;
  uploadState: string;
  protocol?: 'tus' | 'multipart';
  bytesReceived: number;
  chunkTotal: number;
  chunkUploaded: number;
  chunkPending: number;
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
  chunksTotal: number;
  chunksUploaded: number;
  chunksPending: number;
};

export type RequiredExportProgressDto = {
  type: export_type;
  state: 'missing' | 'queued' | 'running' | 'succeeded' | 'failed';
  exportId?: string;
  updatedAt?: string;
  lastError?: string;
};

export type RecordingExportProgressDto = {
  requiredTotal: number;
  requiredSucceeded: number;
  requiredPending: number;
  requiredFailed: number;
  required: RequiredExportProgressDto[];
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
  exports: RecordingExportProgressDto;
  participants: ParticipantProgressDto[];
};
