import { NextRequest, NextResponse } from 'next/server';
import {
  getWorkflowSettings,
  normalizeWorkflowSettings,
  WORKFLOW_SETTINGS_COOKIE,
} from '@/lib/workflowSettings';

export async function GET() {
  return NextResponse.json({ ok: true, data: await getWorkflowSettings() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const settings = normalizeWorkflowSettings(body);

  const response = NextResponse.json({ ok: true, data: settings });
  response.cookies.set(WORKFLOW_SETTINGS_COOKIE, JSON.stringify(settings), {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
