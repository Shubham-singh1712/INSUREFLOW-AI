import { NextRequest, NextResponse } from 'next/server';
import { DEMO_MODE_COOKIE, getDemoModeState } from '@/lib/demoMode';

export async function GET() {
  return NextResponse.json({ ok: true, data: await getDemoModeState() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json(
      { ok: false, error: 'Demo mode enabled flag is required.' },
      { status: 400 }
    );
  }

  const response = NextResponse.json({
    ok: true,
    data: { ...(await getDemoModeState()), enabled: body.enabled, isManualOverride: true },
  });
  response.cookies.set(DEMO_MODE_COOKIE, body.enabled ? 'on' : 'off', {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
