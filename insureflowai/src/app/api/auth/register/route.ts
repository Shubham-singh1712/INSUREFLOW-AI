import { NextRequest } from 'next/server';
import { registerUser, type UserRole } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/api';

const validRoles = new Set<UserRole>([
  'admin',
  'insurance_desk',
  'billing_executive',
  'compliance_officer',
  'medical_records',
]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const fullName = String(body?.fullName || '').trim();
  const organization = String(body?.organization || '').trim();
  const role = String(body?.role || '') as UserRole;
  const email = String(body?.email || '').trim();
  const password = String(body?.password || '');
  const confirmPassword = String(body?.confirmPassword || '');

  if (!fullName || !organization || !role || !email || !password) {
    return jsonError('All required signup fields must be provided.');
  }

  if (!validRoles.has(role)) {
    return jsonError('Select a valid role.');
  }

  if (password.length < 8) {
    return jsonError('Password must be at least 8 characters.');
  }

  if (password !== confirmPassword) {
    return jsonError('Passwords do not match.');
  }

  try {
    const user = registerUser({ fullName, organization, role, email, password });
    return jsonOk({ user }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to create account.');
  }
}
