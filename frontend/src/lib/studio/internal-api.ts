'use client';

import { api } from '@/lib/api';

export type StudioTrackKind = 'audio' | 'video' | 'screen';

export type RegisterTrackRequest = {
  participantId: string;
  kind: StudioTrackKind;
  codec?: string;
};

export type RegisterTrackResponse = {
  track: {
    id: string;
    recordingId: string;
    participantId: string;
    kind: StudioTrackKind;
    codec?: string;
    state: string;
    createdAt: string;
  };
  existed: boolean;
};

export type FinalizeTrackRequest = {
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

export type InitiateTrackChunkRequest = {
  trackId: string;
  seq: number;
  protocol: 'presigned_url';
  bytesExpected?: number;
};

export type InitiateTrackChunkResponse = {
  status?: 'existing' | 'accepted' | 'seq_mismatch';
  nextExpectedSeq?: number;
  highestContiguousUploadedSeq?: number;
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
  uploadPlan?: {
    protocol: 'presigned_url';
    url: string;
    key: string;
    expiresAt: string;
  };
  reconciliation?: {
    requestedSeq: number;
    reason: 'stale' | 'ahead';
  };
};

export type CompleteTrackChunkRequest = {
  protocol: 'presigned_url';
  bytesReceived?: number;
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
      failureReason?: string;
      lastErrorAt?: string;
      updatedAt: string;
    }>;
  };
};

export const StudioRecordingAPI = {
  registerTrack: (id: string, body: RegisterTrackRequest) =>
    api<RegisterTrackResponse>(`/v1/recordings/${id}/tracks/register`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  finalizeTrack: (id: string, trackId: string, body: FinalizeTrackRequest) =>
    api<FinalizeTrackResponse>(`/v1/recordings/${id}/tracks/${trackId}/finalize`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getTrackChunkRecovery: (id: string, trackId: string) =>
    api<TrackChunkRecoveryResponse>(`/v1/recordings/${id}/tracks/${trackId}/chunks/recovery`),
  initiateChunk: (id: string, body: InitiateTrackChunkRequest) =>
    api<InitiateTrackChunkResponse>(`/v1/recordings/${id}/chunks/initiate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  completeChunk: (id: string, chunkId: string, body: CompleteTrackChunkRequest) =>
    api<CompleteTrackChunkResponse>(`/v1/recordings/${id}/chunks/${chunkId}/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
