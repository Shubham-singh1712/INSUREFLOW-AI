import { NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUser } from '@/lib/api';
import { scrubClaimData, type ExtractedClaimData } from '@/lib/claims';

export async function POST(request: NextRequest) {
  const { response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const confirmedData = body?.confirmedData as ExtractedClaimData | undefined;

  if (!confirmedData) {
    return jsonError('Confirmed claim data is required.');
  }

  return jsonOk(scrubClaimData(confirmedData));
}
