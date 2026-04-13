export const POST_AUTH_REDIRECT_COOKIE = 'studio_cast_next';

export function normalizeAuthRedirectPath(value: string | null | undefined): string | null {
  if (!value) return null;

  let decoded = value.trim();
  if (!decoded) return null;

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the raw value if it was not URI-encoded.
  }

  if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
  if (decoded === '/landing' || decoded.startsWith('/landing?')) return null;
  if (decoded === '/start' || decoded.startsWith('/start?')) return null;

  return decoded;
}

export function buildAuthRedirectHref(pathname: string, nextPath: string | null) {
  if (!nextPath || nextPath === '/') return pathname;

  const params = new URLSearchParams({ next: nextPath });
  return `${pathname}?${params.toString()}`;
}

export function clearAuthRedirectCookie() {
  if (typeof document === 'undefined') return;

  document.cookie = `${POST_AUTH_REDIRECT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function writeAuthRedirectCookie(nextPath: string | null | undefined) {
  if (typeof document === 'undefined') return;

  const normalized = normalizeAuthRedirectPath(nextPath);
  if (!normalized || normalized === '/') {
    clearAuthRedirectCookie();
    return;
  }

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${POST_AUTH_REDIRECT_COOKIE}=${encodeURIComponent(normalized)}; Path=/; SameSite=Lax${secure}`;
}
