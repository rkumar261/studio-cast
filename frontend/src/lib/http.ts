const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

export type ApiAuthMode = 'default' | 'guest';

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

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retryOnAuth = true
): Promise<T> {
  const hasJsonBody = typeof options.body === 'string' && options.body.length > 0;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
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
    let detail: unknown = undefined;
    try {
      detail = await res.json();
    } catch {
      detail = undefined;
    }

    const detailRecord =
      typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>) : null;
    const code = detailRecord
      ? String(detailRecord.code ?? detailRecord.error ?? 'http_error')
      : 'http_error';
    const message =
      detailRecord && 'message' in detailRecord
        ? String(detailRecord.message)
        : `HTTP ${res.status}`;
    const requestId = res.headers.get('x-request-id') ?? undefined;
    const err = new Error(message) as Error & {
      code?: string;
      details?: unknown;
      requestId?: string;
      status?: number;
    };
    err.code = code;
    err.details = detailRecord?.details;
    err.requestId = requestId;
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export { API_BASE };
