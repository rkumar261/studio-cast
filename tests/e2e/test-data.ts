function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const e2eData = {
  recordingId: required('E2E_RECORDING_ID'),
  guestInviteUrl: required('E2E_GUEST_INVITE_URL'),
  hostStudioUrl: () => `/studio/${required('E2E_RECORDING_ID')}`,
  guestStudioUrl: () => required('E2E_GUEST_INVITE_URL'),
  projectUrl: () => `/recordings/${required('E2E_RECORDING_ID')}`,
};