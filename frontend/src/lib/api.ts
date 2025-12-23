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

async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',            // <- send/receive HttpOnly cookies
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let detail: unknown = undefined;
    try { detail = await res.json(); } catch { }
    const message =
      typeof detail === 'object' && detail !== null && 'message' in detail
        ? String((detail as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new Error(message);
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


export const RecordingsAPI = {
  create: (title?: string) =>
    api<CreateRecordingResponse>('/v1/recordings', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    }),
  listMine: (limit = 20, cursor?: string) =>
    api<ListRecordingsResponse>(`/v1/recordings?owner=me&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`),
  getById: (id: string) => api<GetRecordingResponse>(`/v1/recordings/${id}`),
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

export { api, API_BASE };