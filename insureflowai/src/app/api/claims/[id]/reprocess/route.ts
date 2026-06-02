import { NextResponse } from 'next/server'; // // MODIFIED
import path from 'path'; // // MODIFIED
import fs from 'fs'; // // MODIFIED
import { requireUser } from '@/lib/api'; // // MODIFIED
import { getClaimById } from '@/lib/claim-processing/db'; // // MODIFIED
import { processClaimPipeline } from '@/lib/claim-processing/pipeline'; // // MODIFIED
import { mapExtractedFieldsToUi } from '@/lib/claim-processing/mapping'; // // MODIFIED
import { logger } from '@/lib/claim-processing/logger'; // // MODIFIED

export const runtime = 'nodejs'; // // MODIFIED

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: claimId } = await params;
  logger.info('API', `Reprocessing claim ${claimId}`);

  try {
    const { response: authResponse } = await requireUser();
    if (authResponse) {
      return authResponse;
    }

    const claim = await getClaimById(claimId);
    if (!claim) {
      return NextResponse.json({ success: false, error: 'Claim record not found' }, { status: 404 });
    }

    const savedPdfPath = path.join('/tmp', 'temp_claims', `${claimId}.pdf`); // MODIFIED — /tmp matches where pipeline.ts writes the file
    if (!fs.existsSync(savedPdfPath)) {
      return NextResponse.json(
        { success: false, error: 'Original uploaded PDF document is not available on disk for reprocessing' },
        { status: 400 }
      );
    }

    const fileBuffer = fs.readFileSync(savedPdfPath);

    const sessionData = {
      claimId: claim.id,
      uploadSessionId: claim.upload_session_id || 'reprocess-session',
      originalFileName: claim.file_name || 'reprocessed.pdf',
      fileSizeBytes: fileBuffer.length,
      uploadStartedAt: new Date().toISOString(),
    };

    // Run the pipeline again // // MODIFIED
    const packet = await processClaimPipeline(fileBuffer, sessionData);

    // Map extracted fields to UI format // // MODIFIED
    const uiFields = mapExtractedFieldsToUi(packet.extractedFields, packet);

    return NextResponse.json({
      ...packet,
      uiFields,
    });
  } catch (error: any) { // // MODIFIED
    logger.error('API', `Reprocessing failed for claim ${claimId}`, error); // // MODIFIED
    return NextResponse.json( // // MODIFIED
      { success: false, error: error.message || 'Reprocessing failed' }, // // MODIFIED
      { status: 500 } // // MODIFIED
    ); // // MODIFIED
  } // // MODIFIED
} // // MODIFIED
