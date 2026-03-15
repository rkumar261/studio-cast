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
  protocol: 'tus';
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
    tusUploadId?: string;
    tusResourceUrl?: string;
    tusUploadState?: string;
    failureReason?: string;
    lastErrorAt?: string;
    materializedAt?: string;
    createdAt: string;
    updatedAt: string;
  };
  existed?: boolean;
  already?: boolean;
  uploadPlan?: {
    protocol: 'tus';
    tusEndpoint: string;
    metadata: {
      chunkId: string;
      recordingId: string;
      trackId: string;
      seq: string;
    };
  };
  resumeUploadPlan?: {
    protocol: 'tus';
    tusEndpoint: string;
    chunkId: string;
    tusId?: string;
    tusUrl?: string;
    tusResourceUrl?: string;
    tusUploadState?: string;
  };
  reconciliation?: {
    requestedSeq: number;
    reason: 'stale' | 'ahead';
  };
};

export type CompleteTrackChunkRequest = {
  protocol: 'tus';
  bytesReceived?: number;
  storageKeyRaw?: string;
  etag?: string;
  checksumSha256?: string;
  tusUrl?: string;
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
    tusUploadId?: string;
    tusResourceUrl?: string;
    tusUploadState?: string;
    failureReason?: string;
    lastErrorAt?: string;
    materializedAt?: string;
    etag?: string;
    checksumSha256?: string;
    createdAt: string;
    updatedAt: string;
  };
  already?: boolean;
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
