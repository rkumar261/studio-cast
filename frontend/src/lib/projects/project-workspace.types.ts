import type {
  GetProjectAssetsGraphResponse,
  GetRecordingResponse,
  ProjectAssetActionDto,
  ProjectAssetState,
  RecordingProgressResponse,
} from '@/lib/api';

export type ProjectWorkspaceInput = {
  recording: GetRecordingResponse['recording'];
  progress: RecordingProgressResponse | null;
  projectAssets: GetProjectAssetsGraphResponse | null;
};

export type ProjectHeroViewModel = {
  label: string;
  state: ProjectAssetState;
  stateLabel: string;
  summary: string;
  durationLabel?: string;
  previewUrl?: string;
  rawPreviewUrl?: string;
  blockedReason?: string | null;
  actions: ProjectAssetActionDto[];
};

export type ProjectTrackRowViewModel = {
  id: string;
  title: string;
  subtitle: string;
  state: ProjectAssetState;
  stateLabel: string;
  blockedReason?: string | null;
  previewUrl?: string;
  warnings: string[];
  actions: ProjectAssetActionDto[];
};

export type ProjectArtifactRowViewModel = {
  id: string;
  title: string;
  kind: 'transcript' | 'captions' | 'export';
  state: ProjectAssetState;
  stateLabel: string;
  summary: string;
  blockedReason?: string | null;
  actions: ProjectAssetActionDto[];
};

export type ProjectProcessingBannerViewModel = {
  state: ProjectAssetState;
  stateLabel: string;
  summary: string;
  minimumReady?: boolean;
  fullyProcessed?: boolean;
  pending: string[];
  failed: string[];
  progress: {
    participantsComplete: number;
    participantsTotal: number;
    participantsUploading: number;
    actionRequiredParticipants: number;
  } | null;
};

export type ProjectWorkspaceViewModel = {
  id: string;
  title: string;
  createdAtLabel: string;
  projectState: ProjectAssetState;
  projectStateLabel: string;
  projectStateClass: string;
  hero: ProjectHeroViewModel | null;
  processingBanner?: ProjectProcessingBannerViewModel;
  tracks: ProjectTrackRowViewModel[];
  artifacts: ProjectArtifactRowViewModel[];
};
