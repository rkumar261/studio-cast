const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

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
    let detail: any = undefined;
    try { detail = await res.json(); } catch { }
    throw new Error(detail?.message || `HTTP ${res.status}`);
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
  tracks: Array<any>;
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

export { api, API_BASE };