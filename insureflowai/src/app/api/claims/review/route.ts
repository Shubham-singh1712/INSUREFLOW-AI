import { NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUser } from '@/lib/api';
import { getLiveClaim, saveReviewClaim } from '@/lib/liveClaims';
import type { ExtractedClaimData } from '@/lib/claims';

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const claimId = request.nextUrl.searchParams.get('claimId');
  if (!claimId) return jsonError('Claim ID is required.');

  const claim = await getLiveClaim(user.id, claimId);
  if (!claim) return jsonError('Claim not found.', 404);

  return jsonOk(claim);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const claimId = String(body?.claimId || '');
  const confirmedData = body?.confirmedData as ExtractedClaimData | undefined;
  const reviewReasons = Array.isArray(body?.reviewReasons)
    ? body.reviewReasons.map(String).filter(Boolean)
    : [];

  if (!claimId || !confirmedData) {
    return jsonError('Claim ID and confirmed data are required.');
  }

  const claim = await saveReviewClaim({
    userId: user.id,
    claimId,
    confirmedData,
    reviewReasons,
  });

  return jsonOk(claim, { status: 201 });
}
