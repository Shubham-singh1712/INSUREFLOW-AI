import { NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUser } from '@/lib/api';
import { mockExtractedClaimData, type UploadedDoc } from '@/lib/claims';

export async function POST(request: NextRequest) {
  const { response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const documents = body?.documents as Record<string, UploadedDoc> | undefined;

  if (!documents || Object.keys(documents).length === 0) {
    return jsonError('At least one uploaded document is required for extraction.');
  }

  return jsonOk({
    claimId: body?.claimId || 'CLM-2852',
    extractedData: mockExtractedClaimData,
    sourceDocumentCount: Object.keys(documents).length,
  });
}
