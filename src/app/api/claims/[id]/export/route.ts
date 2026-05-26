import { NextResponse } from 'next/server'; // // MODIFIED
import { requireUser } from '@/lib/api'; // // MODIFIED
import { getClaimById } from '@/lib/claim-processing/db'; // // MODIFIED
import { logger } from '@/lib/claim-processing/logger'; // // MODIFIED

export const runtime = 'nodejs'; // // MODIFIED
export const dynamic = 'force-dynamic'; // // MODIFIED

export async function GET( // // MODIFIED
  request: Request, // // MODIFIED
  { params }: { params: { id: string } } // // MODIFIED
) { // // MODIFIED
  return handleExport(params.id); // // MODIFIED
} // // MODIFIED

export async function POST( // // MODIFIED
  request: Request, // // MODIFIED
  { params }: { params: { id: string } } // // MODIFIED
) { // // MODIFIED
  return handleExport(params.id); // // MODIFIED
} // // MODIFIED

async function handleExport(claimId: string) { // // MODIFIED
  logger.info('API', `Exporting claim dataset for ${claimId}`); // // MODIFIED

  try { // // MODIFIED
    const { response: authResponse } = await requireUser(); // // MODIFIED
    if (authResponse) { // // MODIFIED
      return authResponse; // // MODIFIED
    } // // MODIFIED

    const claim = await getClaimById(claimId); // // MODIFIED
    if (!claim) { // // MODIFIED
      return NextResponse.json({ success: false, error: 'Claim not found' }, { status: 404 }); // // MODIFIED
    } // // MODIFIED

    // Format the export packet for external audit / API consumption // // MODIFIED
    const exportPacket = { // // MODIFIED
      claimId: claim.id, // // MODIFIED
      userId: claim.user_id, // // MODIFIED
      fileName: claim.file_name, // // MODIFIED
      fileSize: claim.file_size, // // MODIFIED
      status: claim.status, // // MODIFIED
      scores: { // // MODIFIED
        healthScore: claim.health_score, // // MODIFIED
        readinessScore: claim.readiness_score, // // MODIFIED
        ocrConfidence: claim.ocr_confidence, // // MODIFIED
      }, // // MODIFIED
      extractedData: claim.extracted_data || {}, // // MODIFIED
      validationErrors: claim.validation_errors || [], // // MODIFIED
      classifiedPages: claim.classified_pages || [], // // MODIFIED
      exportedAt: new Date().toISOString(), // // MODIFIED
    }; // // MODIFIED

    return NextResponse.json({ // // MODIFIED
      success: true, // // MODIFIED
      exportPacket, // // MODIFIED
    }); // // MODIFIED
  } catch (error: any) { // // MODIFIED
    logger.error('API', `Failed to export claim ${claimId}`, error); // // MODIFIED
    return NextResponse.json( // // MODIFIED
      { success: false, error: error.message || 'Failed to export claim' }, // // MODIFIED
      { status: 500 } // // MODIFIED
    ); // // MODIFIED
  } // // MODIFIED
} // // MODIFIED
