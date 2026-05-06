import { api } from '@/lib/http';

export type CreateRecordingResponse = {
  recording: { id: string; title?: string; status: string; createdAt: string };
};

export type ListRecordingsResponse = {
  items: Array<{
    id: string;
    title?: string;
    participantNames?: string[];
    status: string;
    createdAt: string;
    thumbnailUrl?: string;
  }>;
  nextCursor?: string;
};

export type GetRecordingResponse = {
  recording: { id: string; title?: string; createdAt: string };
};

export type ConsumerRecordingState =
  | 'invited'
  | 'recording'
  | 'uploading'
  | 'upload complete'
  | 'processing'
  | 'ready'
  | 'action required';

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
  qualityWarnings?: {
    audioWarning?: string;
    videoWarning?: string;
    durationWarning?: boolean;
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

export type RecordingSessionDto = {
  recordingId: string;
  status: 'draft' | 'uploading' | 'processing' | 'ready' | 'error';
  startedAt?: string;
  stoppedAt?: string;
  hostParticipantId?: string;
  controlVersion: number;
};

export type RecordingSessionResponse = {
  session: RecordingSessionDto;
  canControl: boolean;
};

export type RecordingParticipantProgressDto = {
  participantId: string;
  role: 'host' | 'guest' | string;
  displayName?: string;
  state: ConsumerRecordingState;
  progressPct: number;
  blockedReason?: string;
};

export type RecordingProgressResponse = {
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
  summary: {
    participantsTotal: number;
    participantsComplete: number;
    participantsUploading: number;
    actionRequiredParticipants: number;
  };
  participants: RecordingParticipantProgressDto[];
};

export const RecordingsAPI = {
  create: (title?: string) =>
    api<CreateRecordingResponse>('/v1/recordings', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    }),
  listMine: (limit = 20, cursor?: string) =>
    api<ListRecordingsResponse>(`/v1/recordings?owner=me&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`),
  getById: (id: string) => api<GetRecordingResponse>(`/v1/recordings/${id}`),
  rename: (id: string, title: string) =>
    api<GetRecordingResponse>(`/v1/recordings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  getProjectAssets: (id: string) =>
    api<GetProjectAssetsGraphResponse>(`/v1/recordings/${id}/project-assets`),
  getSession: (id: string) => api<RecordingSessionResponse>(`/v1/recordings/${id}/session`),
  startSession: (id: string) =>
    api<RecordingSessionResponse>(`/v1/recordings/${id}/session/start`, {
      method: 'POST',
    }),
  stopSession: (id: string) =>
    api<RecordingSessionResponse>(`/v1/recordings/${id}/session/stop`, {
      method: 'POST',
    }),
  getProgress: (id: string) =>
    api<RecordingProgressResponse>(`/v1/recordings/${id}/progress`),
};
