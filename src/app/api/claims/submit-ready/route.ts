import { jsonOk, requireUser } from '@/lib/api';
import { submitReadyClaims } from '@/lib/liveClaims';

export async function POST() {
  const { user, response } = await requireUser();
  if (response) return response;

  return jsonOk(await submitReadyClaims(user.id));
}
