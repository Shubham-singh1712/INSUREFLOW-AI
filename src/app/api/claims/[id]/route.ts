import { NextResponse } from 'next/server'; // // MODIFIED
import { requireUser } from '@/lib/api'; // // MODIFIED
import { getClaimById } from '@/lib/claim-processing/db'; // // MODIFIED
import { mapExtractedFieldsToUi } from '@/lib/claim-processing/mapping'; // // MODIFIED
import { logger } from '@/lib/claim-processing/logger'; // // MODIFIED

export const runtime = 'nodejs'; // // MODIFIED
export const dynamic = 'force-dynamic'; // // MODIFIED

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: claimId } = await params;
  logger.info('API', `GET claim details for ${claimId}`);

  try { // // MODIFIED
    const { user, response: authResponse } = await requireUser(); // // MODIFIED
    if (authResponse) { // // MODIFIED
      return authResponse; // // MODIFIED
    } // // MODIFIED

    const claim = await getClaimById(claimId); // // MODIFIED
    if (!claim) { // // MODIFIED
      return NextResponse.json({ success: false, error: 'Claim not found' }, { status: 404 }); // // MODIFIED
    } // // MODIFIED

    // Reconstruct a pseudo packet for the UI mapper // // MODIFIED
    const packet: any = { // // MODIFIED
      claimId: claim.id, // // MODIFIED
      extractionMethod: claim.extracted_data ? 'mixed' : 'ocr', // // MODIFIED
      pageCount: claim.classified_pages ? claim.classified_pages.length : 1, // // MODIFIED
      classifiedPages: claim.classified_pages || [], // // MODIFIED
      extractedFields: claim.extracted_data || {}, // // MODIFIED
      validationErrors: claim.validation_errors || [], // // MODIFIED
      claimHealth: claim.health_score || 0, // // MODIFIED
      readiness: claim.readiness_score || 0, // // MODIFIED
      ocrConfidence: claim.ocr_confidence || 0, // // MODIFIED
      state: claim.status, // // MODIFIED
    }; // // MODIFIED

    const uiFields = mapExtractedFieldsToUi(packet.extractedFields, packet); // // MODIFIED

    return NextResponse.json({ // // MODIFIED
      success: true, // // MODIFIED
      claim, // // MODIFIED
      uiFields, // // MODIFIED
    }); // // MODIFIED
  } catch (error: any) { // // MODIFIED
    logger.error('API', `Failed to fetch claim ${claimId}`, error); // // MODIFIED
    return NextResponse.json( // // MODIFIED
      { success: false, error: error.message || 'Failed to fetch claim details' }, // // MODIFIED
      { status: 500 } // // MODIFIED
    ); // // MODIFIED
  } // // MODIFIED
} // // MODIFIED
