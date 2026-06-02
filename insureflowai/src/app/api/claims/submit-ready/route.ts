import { jsonOk, requireUser } from '@/lib/api';
import { submitReadyClaims } from '@/lib/liveClaims';
import { revalidateClaimViews } from '@/lib/claimViewRevalidation';

export async function POST() {
  const { user, response } = await requireUser();
  if (response) return response;

  const result = await submitReadyClaims(user.id);
  revalidateClaimViews();
  return jsonOk(result);
}
