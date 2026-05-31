import { jsonOk, requireUser } from '@/lib/api';
import { listLiveClaims } from '@/lib/liveClaims';
import { isValidationRequired } from '@/lib/claimLifecycle';

export async function POST() {
  const { user, response } = await requireUser();
  if (response) return response;

  const claims = await listLiveClaims(user.id);
  const needsReview = claims.filter((claim) => isValidationRequired(claim.status)).length;
  const clean = claims.length - needsReview;

  return jsonOk({
    checked: claims.length,
    clean,
    needsReview,
  });
}
