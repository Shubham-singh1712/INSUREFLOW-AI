import { NextRequest } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || '').trim();

  if (!email) {
    return jsonError('Email is required.');
  }

  return jsonOk({
    email,
    message: 'If an account exists, a password reset link will be sent.',
    expiresInMinutes: 30,
  });
}
