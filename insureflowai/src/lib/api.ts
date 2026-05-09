import { NextResponse } from 'next/server';
import { getCurrentUser } from './auth';

export const jsonOk = <T>(data: T, init?: ResponseInit) => NextResponse.json({ ok: true, data }, init);

export const jsonError = (message: string, status = 400) =>
  NextResponse.json({ ok: false, error: message }, { status });

export const requireUser = async () => {
  const user = await getCurrentUser();

  if (!user) {
    return { user: null, response: jsonError('Authentication required.', 401) };
  }

  return { user, response: null };
};
