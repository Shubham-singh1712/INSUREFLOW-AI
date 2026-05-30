import { NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUser } from '@/lib/api';
import { saveClaimState, getClaimById, addAuditLog } from '@/lib/claim-processing/db';
import { validateExtractedData } from '@/lib/claim-processing/validation';
import { calculateScores } from '@/lib/claim-processing/scoring';
import { getLiveClaim } from '@/lib/liveClaims';
import type { ExtractedFields } from '@/lib/claim-processing/types';

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
  const extractedFields = body?.extractedFields as ExtractedFields | undefined;

  if (!claimId || !extractedFields) {
    return jsonError('Claim ID and extractedFields are required.');
  }

  // Get existing claim detail to know pageCount or default
  const existingClaim = await getClaimById(claimId);
  const pageCount = existingClaim?.classified_pages ? existingClaim.classified_pages.length : 1;
  const ocrConfidence = existingClaim?.ocr_confidence || 90;

  // Run validation and scoring on the updated fields
  const { errors, repairSuggestions } = validateExtractedData(extractedFields, pageCount);
  const { claimHealth, readiness, extractionConfidence, rejectionRisk } = calculateScores(
    extractedFields,
    errors,
    ocrConfidence
  );

  const nextState = errors.length > 0 ? 'REVIEW_REQUIRED' : 'READY';

  // Save the updated fields, health, readiness, risk to Supabase & cache bridge
  await saveClaimState(claimId, nextState, {
    extractedFields,
    validationErrors: errors,
    repairSuggestions,
    claimHealth,
    readiness,
    ocrConfidence,
    rejectionRisk
  });

  // Log audit log for field edit
  await addAuditLog(claimId, 'Field Edited', `Claim fields edited and re-validated (health: ${claimHealth}%, readiness: ${readiness}%, issues remaining: ${errors.length}).`);

  return jsonOk({
    success: true,
    claimId,
    extractedFields,
    validationErrors: errors,
    repairSuggestions,
    claimHealth,
    readiness,
    rejectionRisk,
    state: nextState
  });
}
