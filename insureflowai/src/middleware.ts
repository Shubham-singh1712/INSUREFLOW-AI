import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export function middleware(request: NextRequest) {
  return updateSession(request);
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
