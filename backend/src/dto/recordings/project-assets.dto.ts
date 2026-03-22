import type { ConsumerRecordingState } from './progress.dto.js';

export type ProjectAssetState = ConsumerRecordingState;

export type ProjectAssetActionDto = {
  id: string;
  label: string;
  kind: 'open_url' | 'api';
  href: string;
  method: 'GET';
};

export type ProjectAssetWorkItemDto = {
  label: string;
  state: 'uploading' | 'processing' | 'action required';
  reason?: string;
  participantId?: string;
};

export type ProjectMediaAssetDto = {
  id: string;
  kind: 'combined' | 'participant';
  type: 'combined_playback' | 'participant_playback';
  label: string;
  state: ProjectAssetState;
  badges: string[];
  durationMs?: number;
  width?: number;
  height?: number;
  previewUrl?: string;
  playbackUrl?: string;
  rawPreviewUrl?: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  blockedReason?: string;
  availableDerivatives: string[];
  minimumReady: boolean;
  fullyProcessed: boolean;
  pendingWork: ProjectAssetWorkItemDto[];
  failedWork: ProjectAssetWorkItemDto[];
  participantId?: string;
  displayName?: string;
  role?: string;
  actions: ProjectAssetActionDto[];
  participant?: {
    id: string;
    role: string;
    name?: string;
  };
};

export type ProjectTranscriptAssetDto = {
  id?: string;
  type: 'transcript_artifact' | 'caption_derivative';
  label: string;
  state: ProjectAssetState;
  badges: string[];
  previewUrl?: string;
  downloadUrl?: string;
  blockedReason?: string;
  minimumReady: boolean;
  fullyProcessed: boolean;
  pendingWork: ProjectAssetWorkItemDto[];
  failedWork: ProjectAssetWorkItemDto[];
  actions: ProjectAssetActionDto[];
};

export type ProjectExportAssetDto = {
  id?: string;
  type: 'wav' | 'mp4' | 'mp4_captions';
  label: string;
  state: ProjectAssetState;
  badges: string[];
  blockedReason?: string;
  downloadUrl?: string;
  minimumReady: boolean;
  fullyProcessed: boolean;
  pendingWork: ProjectAssetWorkItemDto[];
  failedWork: ProjectAssetWorkItemDto[];
  actions: ProjectAssetActionDto[];
};

export type GetProjectAssetsGraphResponse = {
  project: {
    recordingId: string;
    title?: string;
    state: ConsumerRecordingState;
    label: string;
    minimumReady: boolean;
    fullyProcessed: boolean;
  };
  combinedAsset: ProjectMediaAssetDto;
  participantAssets: ProjectMediaAssetDto[];
  processingSummary: {
    minimumReady: boolean;
    fullyProcessed: boolean;
    readyPrimaryAsset: boolean;
    readyParticipantCount: number;
    participantCount: number;
    pendingWork: ProjectAssetWorkItemDto[];
    failedWork: ProjectAssetWorkItemDto[];
  };
  transcript: ProjectTranscriptAssetDto;
  captions: ProjectTranscriptAssetDto;
  exports: {
    requiredTotal: number;
    ready: number;
    processing: number;
    actionRequired: number;
    items: ProjectExportAssetDto[];
  };
};
