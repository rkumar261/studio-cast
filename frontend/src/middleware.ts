import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

  if (pathname === '/') {
    if (!isAuthed) {
      return NextResponse.rewrite(new URL('/landing', req.url));
    }
    return NextResponse.next();
  }

  if (pathname === '/landing' && isAuthed) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (isProtectedPath(pathname) && !isAuthed) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/landing', '/projects', '/projects/:path*', '/settings', '/settings/:path*', '/recordings', '/recordings/:path*'],
};
