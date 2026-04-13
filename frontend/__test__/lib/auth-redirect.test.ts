import {
  buildAuthRedirectHref,
  normalizeAuthRedirectPath,
} from '@/lib/auth-redirect';

describe('auth-redirect', () => {
  it('normalizes safe internal redirect paths only', () => {
    expect(normalizeAuthRedirectPath('/projects/rec_123')).toBe('/projects/rec_123');
    expect(normalizeAuthRedirectPath(encodeURIComponent('/projects/rec_123?tab=tracks'))).toBe(
      '/projects/rec_123?tab=tracks'
    );
    expect(normalizeAuthRedirectPath('//evil.example.com')).toBeNull();
    expect(normalizeAuthRedirectPath('https://evil.example.com')).toBeNull();
    expect(normalizeAuthRedirectPath('/landing')).toBeNull();
    expect(normalizeAuthRedirectPath('/start?mode=login')).toBeNull();
  });

  it('appends next only when a safe path exists', () => {
    expect(buildAuthRedirectHref('/start', '/projects/rec_123')).toBe(
      '/start?next=%2Fprojects%2Frec_123'
    );
    expect(buildAuthRedirectHref('/start', null)).toBe('/start');
    expect(buildAuthRedirectHref('/start', '/')).toBe('/start');
  });
});
