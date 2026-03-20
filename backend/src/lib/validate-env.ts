const REQUIRED_ENV_VARS = [
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE_URL',
] as const;

// R2_ENDPOINT is optional if R2_ACCOUNT_ID is set (derived in config.ts).
// We validate at least one is present.
function hasR2Endpoint(): boolean {
  return !!(process.env.R2_ENDPOINT?.trim() || process.env.R2_ACCOUNT_ID?.trim());
}

export function validateRequiredEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((k) => !process.env[k]?.trim());

  if (!hasR2Endpoint()) {
    missing.push('R2_ENDPOINT (or R2_ACCOUNT_ID)' as any);
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Ensure these are set in backend/.env before starting the server.'
    );
  }
}
