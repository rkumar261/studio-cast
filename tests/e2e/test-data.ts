function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return undefined;
  }
  return value.trim();
}

function normalizeCookieValue(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const prefix = 'access_token=';
  if (trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length);
  }
  return trimmed;
}

export const e2eData = {
  recordingId: required('E2E_RECORDING_ID'),
  guestInviteUrl: required('E2E_GUEST_INVITE_URL'),
  hostStudioUrl: () => `/studio/${required('E2E_RECORDING_ID')}`,
  guestStudioUrl: () => required('E2E_GUEST_INVITE_URL'),
  projectUrl: () => `/recordings/${required('E2E_RECORDING_ID')}`,
  apiBaseUrl: () => optional('E2E_API_BASE') ?? 'http://127.0.0.1:8080',
  ownerAccessToken: normalizeCookieValue(optional('E2E_OWNER_ACCESS_TOKEN')),
};
