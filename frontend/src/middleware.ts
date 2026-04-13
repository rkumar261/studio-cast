import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  normalizeAuthRedirectPath,
  POST_AUTH_REDIRECT_COOKIE,
} from '@/lib/auth-redirect';

function isProtectedPath(pathname: string) {
  return (
    pathname === '/projects' ||
    pathname.startsWith('/projects/') ||
    pathname === '/settings' ||
    pathname.startsWith('/settings/') ||
    pathname === '/recordings' ||
    pathname.startsWith('/recordings/')
  );
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isAuthed = Boolean(
    req.cookies.get('studio_cast_session')?.value || req.cookies.get('access_token')?.value
  );
  const nextFromQuery = normalizeAuthRedirectPath(req.nextUrl.searchParams.get('next'));
  const nextFromCookie = normalizeAuthRedirectPath(
    req.cookies.get(POST_AUTH_REDIRECT_COOKIE)?.value
  );

  if (pathname === '/') {
    if (!isAuthed) {
      return NextResponse.rewrite(new URL('/landing', req.url));
    }

    if (nextFromCookie && nextFromCookie !== '/') {
      const response = NextResponse.redirect(new URL(nextFromCookie, req.url));
      response.cookies.delete(POST_AUTH_REDIRECT_COOKIE);
      return response;
    }

    return NextResponse.next();
  }

  if (pathname === '/landing' && isAuthed) {
    const target = nextFromQuery ?? nextFromCookie ?? '/';
    const response = NextResponse.redirect(new URL(target, req.url));
    response.cookies.delete(POST_AUTH_REDIRECT_COOKIE);
    return response;
  }

  if (isProtectedPath(pathname) && !isAuthed) {
    const requestedPath = normalizeAuthRedirectPath(
      `${pathname}${req.nextUrl.search || ''}`
    );
    const landingUrl = new URL('/landing', req.url);

    if (requestedPath && requestedPath !== '/') {
      landingUrl.searchParams.set('next', requestedPath);
      const response = NextResponse.redirect(landingUrl);
      response.cookies.set({
        name: POST_AUTH_REDIRECT_COOKIE,
        value: encodeURIComponent(requestedPath),
        path: '/',
        sameSite: 'lax',
        secure: req.nextUrl.protocol === 'https:',
      });
      return response;
    } else {
      const response = NextResponse.redirect(landingUrl);
      response.cookies.delete(POST_AUTH_REDIRECT_COOKIE);
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/landing', '/projects', '/projects/:path*', '/settings', '/settings/:path*', '/recordings', '/recordings/:path*'],
};
