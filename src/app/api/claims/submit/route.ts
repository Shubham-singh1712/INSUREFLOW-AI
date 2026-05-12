import { NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUser } from '@/lib/api';
import { buildSubmissionPayload, scrubClaimData, type ExtractedClaimData } from '@/lib/claims';
import { saveSubmittedClaim } from '@/lib/liveClaims';

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const claimId = String(body?.claimId || '');
  const confirmedData = body?.confirmedData as ExtractedClaimData | undefined;

  if (!claimId || !confirmedData) {
    return jsonError('Claim ID and confirmed data are required.');
  }

  const scrubResult = scrubClaimData(confirmedData);

  if (!scrubResult.allPassed) {
    return jsonError('Claim cannot be submitted until all scrubbing constraints pass.', 422);
  }

  await saveSubmittedClaim({
    userId: user.id,
    claimId,
    confirmedData,
  });

  return jsonOk(buildSubmissionPayload(claimId, confirmedData), { status: 201 });
}
