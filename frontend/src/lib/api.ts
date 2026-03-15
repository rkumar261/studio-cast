const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;
type ApiAuthMode = 'default' | 'guest';
let apiAuthMode: ApiAuthMode = 'default';

export function setApiAuthMode(mode: ApiAuthMode) {
  apiAuthMode = mode;
}

async function tryRefreshSession(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  });
  return res.ok;
}

async function api<T>(
  path: string,
  options: RequestInit = {},
  retryOnAuth = true
): Promise<T> {
  const hasJsonBody =
    typeof options.body === 'string' &&
    options.body.length > 0;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',            // <- send/receive HttpOnly cookies
    headers: {
      ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });

  const canAttemptRefresh = retryOnAuth && apiAuthMode !== 'guest' && path !== '/auth/refresh';
  if (res.status === 401 && canAttemptRefresh) {
    const refreshed = await tryRefreshSession().catch(() => false);
    if (refreshed) {
      return api<T>(path, options, false);
    }
  }

  if (!res.ok) {
    let detail: any = undefined;
    try {
      detail = await res.json();
    } catch {
      detail = undefined;
    }
    const code =
      typeof detail === 'object' && detail !== null
        ? String(detail.code ?? detail.error ?? 'http_error')
        : 'http_error';
    const message =
      typeof detail === 'object' && detail !== null && 'message' in detail
        ? String(detail.message)
        : `HTTP ${res.status}`;
    const requestId = res.headers.get('x-request-id') ?? undefined;
    const err = new Error(message) as Error & {
      code?: string;
      details?: unknown;
      requestId?: string;
      status?: number;
    };
    err.code = code;
    err.details = typeof detail === 'object' && detail !== null ? detail.details : undefined;
    err.requestId = requestId;
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}


// ---- Auth endpoints ----
export const AuthAPI = {
  me: async () => {
    const data = await api<{ user: { id: string; email: string; name?: string; imageUrl?: string } }>('/auth/me');
    setApiAuthMode('default');
    return data.user; // unwrap here
  },
  logout: () => {
    setApiAuthMode('default');
    return fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  },
  // Google OAuth start is a redirect; just bounce the browser:
  googleStart: () => {
    setApiAuthMode('default');
    window.location.href = `${API_BASE}/auth/oauth/google/start`;
  },
};

// ---- Recordings ----
export type CreateRecordingResponse = {
  recording: { id: string; title?: string; status: string; createdAt: string };
};

export type ListRecordingsResponse = {
  items: Array<{ id: string; title?: string; status: string; createdAt: string }>;
  nextCursor?: string;
};

export type GetRecordingResponse = {
  recording: { id: string; title?: string; createdAt: string };
};

export type ConsumerRecordingState =
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
  getProjectAssets: (id: string) =>
    api<GetProjectAssetsGraphResponse>(`/v1/recordings/${id}/project-assets`),
  getSession: (id: string) =>
    api<RecordingSessionResponse>(`/v1/recordings/${id}/session`),
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

// ---- Participants ----
export type CreateParticipantResponse = {
  participant: { id: string; recordingId: string; role: 'host' | 'guest'; displayName?: string; email?: string };
  magicLink?: string;
};

export type GetParticipantsResponse = {
  participants: Array<{ id: string; recordingId: string; role: 'host' | 'guest'; displayName?: string; email?: string }>;
};

export type ClaimGuestParticipantResponse = {
  participant: { id: string; recordingId: string; role: 'guest'; displayName?: string; email?: string };
};

export const ParticipantsAPI = {
  bootstrapGuest: async (payload: { token: string; displayName: string; email?: string }) => {
    const response = await api<ClaimGuestParticipantResponse>('/v1/guest/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setApiAuthMode('guest');
    return response;
  },
  claimGuest: async (token: string) => {
    const response = await api<ClaimGuestParticipantResponse>('/v1/participants/claim', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    setApiAuthMode('guest');
    return response;
  },
  create: (recordingId: string, payload: { role: 'host' | 'guest'; displayName: string; email?: string }) =>
    api<CreateParticipantResponse>(`/v1/recordings/${recordingId}/participants`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  list: (recordingId: string) =>
    api<GetParticipantsResponse>(`/v1/recordings/${recordingId}/participants`),
};

// --- Transcript types & API ---
export type TranscriptSegmentDto = {
  id: string;
  recordingId: string;
  trackId: string | null;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null;
  confidence: number | null;
};

export type TranscriptAssetDto = {
  id?: string;
  state: 'pending' | 'processing' | 'ready' | 'failed';
  revision: number;
  language?: string;
  sourceType?: string;
  sourceAssetId?: string;
  segmentCount: number;
  processingStartedAt?: string;
  publishedAt?: string;
  readyAt?: string;
  failedAt?: string;
  failureReason?: string;
};

export type GetTranscriptResponse = {
  recordingId: string;
  transcript: TranscriptAssetDto;
  segments: TranscriptSegmentDto[];
};

export type SaveTranscriptSegmentInput = {
  trackId?: string | null;
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string | null;
  confidence?: number | null;
};

export type SaveTranscriptRequest = {
  baseRevision?: number;
  publish?: boolean;
  segments: SaveTranscriptSegmentInput[];
};

export const TranscriptAPI = {
  getForRecording: (recordingId: string) =>
    api<GetTranscriptResponse>(`/v1/recordings/${recordingId}/transcript`),
  saveRevision: (recordingId: string, body: SaveTranscriptRequest) =>
    api<GetTranscriptResponse>(`/v1/recordings/${recordingId}/transcript`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};

// --- Exports types & API ---
export type ExportType = 'wav' | 'mp4' | 'mp4_captions';
export type ExportState = 'queued' | 'running' | 'succeeded' | 'failed';

export type ExportDto = {
  id: string;
  recordingId: string;
  type: ExportType;
  state: ExportState;
  combinedAssetId?: string;
  participantAssetId?: string;
  transcriptId?: string;
  lastError?: string;
  failureReason?: string;
  startedAt?: string;
  readyAt?: string;
  failedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ListExportsResponse = {
  recordingId: string;
  exports: ExportDto[];
};

export type CreateExportBody = {
  recordingId: string;
  type: ExportType;
};

export type CreateExportResponse = {
  export: ExportDto;
};

export type GetExportResponse = {
  export: ExportDto;
  downloadUrl?: string;
};

export const ExportsAPI = {
  create: (recordingId: string, type: ExportType) =>
    api<CreateExportResponse>('/v1/exports', {
      method: 'POST',
      body: JSON.stringify({ recordingId, type }),
    }),

  listForRecording: (recordingId: string) =>
    api<ListExportsResponse>(`/v1/recordings/${recordingId}/exports`),

  getById: (exportId: string) =>
    api<GetExportResponse>(`/v1/exports/${exportId}`),
};

// --- LiveKit token ---
export type LivekitTokenResponse = {
  token: string;
  wsUrl: string;
};

export const LiveKitAPI = {
  getToken: (roomName: string) =>
    api<LivekitTokenResponse>('/v1/livekit/token', {
      method: 'POST',
      body: JSON.stringify({ roomName }),
    }),
};

export { api, API_BASE };
