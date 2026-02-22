const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

export type TrackDto = {
  id: string;
  recordingId: string;
  participantId: string;
  kind: 'audio' | 'video' | 'screen';
  codec?: string;
  durationMs?: number;
  storageKeyRaw?: string;
  storageKeyFinal?: string;
  state: 'recording' | 'uploaded' | 'processed' | string;
};

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

  if (res.status === 401 && retryOnAuth && path !== '/auth/refresh') {
    const refreshed = await tryRefreshSession().catch(() => false);
    if (refreshed) {
      return api<T>(path, options, false);
    }
  }

  if (!res.ok) {
    let detail: unknown = undefined;
    try { detail = await res.json(); } catch { }
    const message =
      typeof detail === 'object' && detail !== null && 'message' in detail
        ? String((detail as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new Error(message);
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
    return data.user; // unwrap here
  },
  logout: () => fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }),
  // Google OAuth start is a redirect; just bounce the browser:
  googleStart: () => { window.location.href = `${API_BASE}/auth/oauth/google/start`; },
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
  recording: { id: string; title?: string; status: string; createdAt: string };
  tracks: TrackDto[];
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

export type RecordingProgressPhase = 'recording' | 'uploading' | 'processing' | 'ready' | 'error';

export type RecordingTrackProgressDto = {
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

export type RecordingParticipantProgressDto = {
  participantId: string;
  role: 'host' | 'guest' | string;
  displayName?: string;
  trackCount: number;
  uploadedCount: number;
  processedCount: number;
  pendingCount: number;
  tracks: RecordingTrackProgressDto[];
};

export type RecordingProgressResponse = {
  recordingId: string;
  status: 'draft' | 'uploading' | 'processing' | 'ready' | 'error';
  phase: RecordingProgressPhase;
  session: {
    startedAt?: string;
    stoppedAt?: string;
    hostParticipantId?: string;
    controlVersion: number;
  };
  summary: {
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
  exports: {
    requiredTotal: number;
    requiredSucceeded: number;
    requiredPending: number;
    requiredFailed: number;
    required: Array<{
      type: 'wav' | 'mp4' | 'mp4_captions';
      state: 'missing' | 'queued' | 'running' | 'succeeded' | 'failed';
      exportId?: string;
      updatedAt?: string;
      lastError?: string;
    }>;
  };
  participants: RecordingParticipantProgressDto[];
};

export type RegisterTrackRequest = {
  participantId: string;
  kind: 'audio' | 'video' | 'screen';
  codec?: string;
};

export type RegisterTrackResponse = {
  track: {
    id: string;
    recordingId: string;
    participantId: string;
    kind: 'audio' | 'video' | 'screen';
    codec?: string;
    state: string;
    createdAt: string;
  };
  existed: boolean;
};

export type InitiateTrackChunkRequest = {
  trackId: string;
  seq: number;
  protocol: 'tus' | 'multipart';
  bytesExpected?: number;
};

export type InitiateTrackChunkResponse = {
  chunk: {
    id: string;
    trackId: string;
    seq: number;
    protocol?: string;
    state: string;
    bytesExpected?: number;
    createdAt: string;
    updatedAt: string;
  };
  existed: boolean;
};

export type CompleteTrackChunkRequest = {
  protocol: 'tus' | 'multipart';
  bytesReceived?: number;
  storageKeyRaw?: string;
  etag?: string;
  checksumSha256?: string;
};

export type InitiateMultipartTrackChunkRequest = {
  trackId: string;
  seq: number;
  bytesExpected?: number;
};

export type CompleteMultipartTrackChunkRequest = Omit<CompleteTrackChunkRequest, 'protocol'>;

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
    etag?: string;
    checksumSha256?: string;
    createdAt: string;
    updatedAt: string;
  };
  already?: boolean;
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
  registerTrack: (id: string, body: RegisterTrackRequest) =>
    api<RegisterTrackResponse>(`/v1/recordings/${id}/tracks/register`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
  initiateChunkMultipart: (id: string, body: InitiateMultipartTrackChunkRequest) =>
    api<InitiateTrackChunkResponse>(`/v1/recordings/${id}/chunks/multipart/initiate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  completeChunkMultipart: (id: string, chunkId: string, body: CompleteMultipartTrackChunkRequest) =>
    api<CompleteTrackChunkResponse>(`/v1/recordings/${id}/chunks/multipart/${chunkId}/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ---- Participants ----
export type CreateParticipantResponse = {
  participant: { id: string; recordingId: string; role: 'host' | 'guest'; displayName?: string; email?: string };
  magicLink?: string;
};

export type GetParticipantsResponse = {
  participants: Array<{ id: string; recordingId: string; role: 'host' | 'guest'; displayName?: string; email?: string }>;
};

export const ParticipantsAPI = {
  create: (recordingId: string, payload: { role: 'host' | 'guest'; displayName: string; email?: string }) =>
    api<CreateParticipantResponse>(`/v1/recordings/${recordingId}/participants`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  list: (recordingId: string) =>
    api<GetParticipantsResponse>(`/v1/recordings/${recordingId}/participants`),
};

// --- Upload  ---
export type UploadProtocol = 'tus' | 'multipart';
export type TrackKind = 'audio' | 'video' | 'screen';

// Discriminated union for initiate
export type InitiateUploadRequest =
  | {
    recordingId: string;
    participantId: string;
    kind: TrackKind;
    protocol: 'tus';
  }
  | {
    recordingId: string;
    participantId: string;
    kind: TrackKind;
    protocol: 'multipart';
    filename: string;          // file.name
    size: number;              // file.size
    contentType?: string;      // file.type
    partSize?: number;         // optional client hint
  };

export type InitiateUploadResponse = {
  upload: {
    id: string;
    trackId: string;
    protocol: UploadProtocol;
    state: 'in_progress';
  };
  // TUS plan
  tusEndpoint?: string;
  // Multipart plan
  presignedUrls?: string[];
  partSize?: number;
};

// Complete: union request that covers both protocols
export type CompleteUploadRequest =
  | { protocol?: 'tus'; bytes?: number; tusUrl?: string }
  | { protocol: 'multipart'; parts: { partNumber: number; etag: string }[]; totalBytes?: number };

export type CompleteUploadResponse = {
  bytes: number;
  storageKeyRaw: string;
  already?: boolean;
};

export const UploadsAPI = {
  initiate: async (body: InitiateUploadRequest): Promise<InitiateUploadResponse> => {
    const r = await fetch(`${API_BASE}/v1/uploads/initiate`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  complete: async (uploadId: string, body: CompleteUploadRequest): Promise<CompleteUploadResponse> => {
    const r = await fetch(`${API_BASE}/v1/uploads/${uploadId}/complete`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};

export const TracksAPI = {
  // Unwraps `{ finalUrl: { url, key } }` into `{ url, key }`
  // and also works if backend is changed to return `{ url, key }` directly.
  finalUrl: async (trackId: string): Promise<{ url: string; key: string }> => {
    const r = await fetch(`${API_BASE}/v1/tracks/${trackId}/final-url`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    });

    if (!r.ok) throw new Error(await r.text());

    const data = (await r.json()) as
      | { finalUrl: { url: string; key: string } }
      | { url: string; key: string };

    // Support both possible shapes from the backend
    if ('finalUrl' in data) {
      return data.finalUrl;
    }
    return data;
  },
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

export type GetTranscriptResponse = {
  recordingId: string;
  segments: TranscriptSegmentDto[]
};

export const TranscriptAPI = {
  getForRecording: (recordingId: string) =>
    api<GetTranscriptResponse>(`/v1/recordings/${recordingId}/transcript`),
};

// --- Exports types & API ---
export type ExportType = 'wav' | 'mp4' | 'mp4_captions';
export type ExportState = 'queued' | 'running' | 'succeeded' | 'failed';

export type ExportDto = {
  id: string;
  recordingId: string;
  type: ExportType;
  state: ExportState;
  storageKey?: string;
  lastError?: string;
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
