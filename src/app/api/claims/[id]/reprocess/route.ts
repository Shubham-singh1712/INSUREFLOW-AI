import { NextResponse } from 'next/server'; // // MODIFIED
import path from 'path'; // // MODIFIED
import fs from 'fs'; // // MODIFIED
import { requireUser } from '@/lib/api'; // // MODIFIED
import { getClaimById } from '@/lib/claim-processing/db'; // // MODIFIED
import { processClaimPipeline } from '@/lib/claim-processing/pipeline'; // // MODIFIED
import { mapExtractedFieldsToUi } from '@/lib/claim-processing/mapping'; // // MODIFIED
import { logger } from '@/lib/claim-processing/logger'; // // MODIFIED

export const runtime = 'nodejs'; // // MODIFIED

export async function POST( // // MODIFIED
  request: Request, // // MODIFIED
  { params }: { params: { id: string } } // // MODIFIED
) { // // MODIFIED
  const claimId = params.id; // // MODIFIED
  logger.info('API', `Reprocessing claim ${claimId}`); // // MODIFIED

  try { // // MODIFIED
    const { response: authResponse } = await requireUser(); // // MODIFIED
    if (authResponse) { // // MODIFIED
      return authResponse; // // MODIFIED
    } // // MODIFIED

    const claim = await getClaimById(claimId); // // MODIFIED
    if (!claim) { // // MODIFIED
      return NextResponse.json({ success: false, error: 'Claim record not found' }, { status: 404 }); // // MODIFIED
    } // // MODIFIED

    const savedPdfPath = path.join('/tmp', 'temp_claims', `${claimId}.pdf`); // MODIFIED — /tmp matches where pipeline.ts writes the file
    if (!fs.existsSync(savedPdfPath)) { // // MODIFIED
      return NextResponse.json( // // MODIFIED
        { success: false, error: 'Original uploaded PDF document is not available on disk for reprocessing' }, // // MODIFIED
        { status: 400 } // // MODIFIED
      ); // // MODIFIED
    } // // MODIFIED

    const fileBuffer = fs.readFileSync(savedPdfPath); // // MODIFIED

    const sessionData = { // // MODIFIED
      claimId: claim.id, // // MODIFIED
      uploadSessionId: claim.upload_session_id || 'reprocess-session', // // MODIFIED
      originalFileName: claim.file_name || 'reprocessed.pdf', // // MODIFIED
      fileSizeBytes: fileBuffer.length, // // MODIFIED
      uploadStartedAt: new Date().toISOString(), // // MODIFIED
    }; // // MODIFIED

    // Run the pipeline again // // MODIFIED
    const packet = await processClaimPipeline(fileBuffer, sessionData); // // MODIFIED

    // Map extracted fields to UI format // // MODIFIED
    const uiFields = mapExtractedFieldsToUi(packet.extractedFields, packet); // // MODIFIED

    return NextResponse.json({ // // MODIFIED
      success: true, // // MODIFIED
      ...packet, // // MODIFIED
      uiFields, // // MODIFIED
    }); // // MODIFIED
  } catch (error: any) { // // MODIFIED
    logger.error('API', `Reprocessing failed for claim ${claimId}`, error); // // MODIFIED
    return NextResponse.json( // // MODIFIED
      { success: false, error: error.message || 'Reprocessing failed' }, // // MODIFIED
      { status: 500 } // // MODIFIED
    ); // // MODIFIED
  } // // MODIFIED
} // // MODIFIED
