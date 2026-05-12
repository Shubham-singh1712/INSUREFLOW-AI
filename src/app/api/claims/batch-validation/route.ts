import { jsonOk, requireUser } from '@/lib/api';
import { listLiveClaims } from '@/lib/liveClaims';

export async function POST() {
  const { user, response } = await requireUser();
  if (response) return response;

  const claims = await listLiveClaims(user.id);
  const clean = claims.filter((claim) => claim.repairStatus === 'clean').length;
  const needsReview = claims.length - clean;

  return jsonOk({
    checked: claims.length,
    clean,
    needsReview,
  });
}
