import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createSessionToken, SESSION_COOKIE } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/api';

const EIGHT_HOURS = 60 * 60 * 8;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || '');
  const password = String(body?.password || '');
  const rememberMe = Boolean(body?.rememberMe);

  if (!email || !password) {
    return jsonError('Email and password are required.');
  }

  const user = authenticateUser(email, password);

  if (!user) {
    return jsonError('Invalid email or password.', 401);
  }

  const maxAge = rememberMe ? THIRTY_DAYS : EIGHT_HOURS;
  const response = jsonOk({ user });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionToken(user, maxAge),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });

  return response;
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Method not allowed.' }, { status: 405 });
}
