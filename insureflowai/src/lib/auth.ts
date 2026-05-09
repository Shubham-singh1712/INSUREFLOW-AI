import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

export const SESSION_COOKIE = 'inflow_session';

export type UserRole =
  | 'admin'
  | 'insurance_desk'
  | 'billing_executive'
  | 'compliance_officer'
  | 'medical_records';

export interface AuthUser {
  id: string;
  fullName: string;
  organization: string;
  role: UserRole;
  email: string;
}

interface StoredUser extends AuthUser {
  password: string;
}

interface SessionPayload {
  user: AuthUser;
  exp: number;
}

declare global {
  var inflowUsers: StoredUser[] | undefined;
}

const demoUsers: StoredUser[] = [
  {
    id: 'usr-admin-apollo',
    fullName: 'Admin User',
    organization: 'Apollo Hospitals',
    role: 'admin',
    email: 'admin@apollohospitals.in',
    password: 'Apollo@Admin2026',
  },
  {
    id: 'usr-sneha-rajan',
    fullName: 'Sneha Rajan',
    organization: 'Apollo Hospitals',
    role: 'insurance_desk',
    email: 'sneha.rajan@apollohospitals.in',
    password: 'InsureDesk@2026',
  },
];

const getUsers = () => {
  if (!globalThis.inflowUsers) {
    globalThis.inflowUsers = [...demoUsers];
  }

  return globalThis.inflowUsers;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const getSessionSecret = () =>
  process.env.AUTH_SESSION_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'inflow-local-dev-session-secret';

const base64url = (input: string | Buffer) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const sign = (payload: string) =>
  base64url(createHmac('sha256', getSessionSecret()).update(payload).digest());

const safeCompare = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
};

export const publicUser = (user: StoredUser): AuthUser => ({
  id: user.id,
  fullName: user.fullName,
  organization: user.organization,
  role: user.role,
  email: user.email,
});

export const authenticateUser = (email: string, password: string) => {
  const user = getUsers().find((candidate) => candidate.email === normalizeEmail(email));

  if (!user || user.password !== password) {
    return null;
  }

  return publicUser(user);
};

export const registerUser = (input: {
  fullName: string;
  organization: string;
  role: UserRole;
  email: string;
  password: string;
}) => {
  const users = getUsers();
  const email = normalizeEmail(input.email);

  if (users.some((user) => user.email === email)) {
    throw new Error('An account already exists for this email.');
  }

  const user: StoredUser = {
    id: `usr-${Date.now()}`,
    fullName: input.fullName.trim(),
    organization: input.organization.trim(),
    role: input.role,
    email,
    password: input.password,
  };

  users.push(user);
  return publicUser(user);
};

export const createSessionToken = (user: AuthUser, maxAgeSeconds: number) => {
  const payload: SessionPayload = {
    user,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const encodedPayload = base64url(JSON.stringify(payload));

  return `${encodedPayload}.${sign(encodedPayload)}`;
};

export const verifySessionToken = (token?: string) => {
  if (!token || !token.includes('.')) return null;

  const [encodedPayload, signature] = token.split('.');
  const expectedSignature = sign(encodedPayload);

  if (!safeCompare(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.user || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.user;
  } catch {
    return null;
  }
};

export const getCurrentUser = async () => {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
};
