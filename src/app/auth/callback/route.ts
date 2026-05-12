import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const getSafeNextPath = (next: string | null, requestUrl: URL) => {
  if (!next) return '/main-dashboard';

  try {
    const parsed = new URL(next, requestUrl.origin);
    if (parsed.origin !== requestUrl.origin) return '/main-dashboard';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/main-dashboard';
  }
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = getSafeNextPath(requestUrl.searchParams.get('next'), requestUrl);

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, request.url));
}
