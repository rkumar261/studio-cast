import type { ConsumerRecordingState } from './progress.dto.js';

export type ProjectAssetState = ConsumerRecordingState;

export type ProjectAssetActionDto = {
  id: string;
  label: string;
  kind: 'open_url' | 'api';
  href: string;
  method: 'GET';
};

export type ProjectMediaAssetDto = {
  id: string;
  kind: 'combined' | 'participant';
  label: string;
  state: ProjectAssetState;
  badges: string[];
  durationMs?: number;
  previewUrl?: string;
  blockedReason?: string;
  actions: ProjectAssetActionDto[];
  participant?: {
    id: string;
    role: string;
    name?: string;
  };
};

export type ProjectTranscriptAssetDto = {
  label: string;
  state: ProjectAssetState;
  badges: string[];
  previewUrl?: string;
  blockedReason?: string;
  actions: ProjectAssetActionDto[];
};

export type ProjectExportAssetDto = {
  type: 'wav' | 'mp4' | 'mp4_captions';
  label: string;
  state: ProjectAssetState;
  badges: string[];
  blockedReason?: string;
  actions: ProjectAssetActionDto[];
};

export type GetProjectAssetsGraphResponse = {
  project: {
    recordingId: string;
    title?: string;
    state: ConsumerRecordingState;
    label: string;
  };
  combinedAsset: ProjectMediaAssetDto;
  participantAssets: ProjectMediaAssetDto[];
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
