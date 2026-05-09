import { NextRequest, NextResponse } from 'next/server';

const protectedPages = [
  '/main-dashboard',
  '/claim-intake-document-upload',
  '/all-claims',
  '/validation-queue',
  '/submission-queue',
  '/pdf-generation',
  '/analytics',
  '/notifications',
  '/team-roles',
  '/settings',
  '/profile',
];
const SESSION_COOKIE = 'inflow_session';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedPage = protectedPages.some((path) => pathname.startsWith(path));

  if (!isProtectedPage) {
    return NextResponse.next();
  }

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/main-dashboard/:path*',
    '/claim-intake-document-upload/:path*',
    '/all-claims/:path*',
    '/validation-queue/:path*',
    '/submission-queue/:path*',
    '/pdf-generation/:path*',
    '/analytics/:path*',
    '/notifications/:path*',
    '/team-roles/:path*',
    '/settings/:path*',
    '/profile/:path*',
  ],
};
