import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

const getSupabaseKey = () =>
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const updateSession = async (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = getSupabaseKey();

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtectedPage = protectedPages.some((path) => pathname.startsWith(path));

  if (isProtectedPage && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === '/' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/main-dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
};
