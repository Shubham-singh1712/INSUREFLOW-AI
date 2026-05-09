import { getCurrentUser } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/api';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return jsonError('Authentication required.', 401);
  }

  return jsonOk({ user });
}
